"""
TrustSphere AI — Graph Service
Manages Neo4j Cypher read and write operations for the fraud graph.
"""

from __future__ import annotations

from app.database.neo4j_client import get_neo4j_driver
from app.utils.logger import logger


def write_login_to_graph(
    customer_id: str,
    name: str,
    fingerprint_hash: str,
    user_agent: str,
    ip_address: str,
    is_flagged: bool,
    is_fraud_flagged: bool,
    city: str = "",
    email: str = "",
) -> None:
    """
    Write user, device, IP, and email nodes to Neo4j on every login.
    If the login is fraud-flagged, create a FraudRing relationship.
    """
    driver = get_neo4j_driver()

    try:
        with driver.session() as session:
            # Merge User node
            session.run(
                """
                MERGE (u:User {customer_id: $customer_id})
                  ON CREATE SET u.name = $name, u.city = $city, u.created_at = datetime()
                  ON MATCH  SET u.last_seen = datetime()
                """,
                customer_id=customer_id,
                name=name,
                city=city,
            )

            # Merge Device node
            session.run(
                """
                MERGE (d:Device {hash: $hash})
                  ON CREATE SET d.user_agent = $ua, d.first_seen = datetime(), d.login_count = 1
                  ON MATCH  SET d.last_seen = datetime(),
                               d.login_count = coalesce(d.login_count, 0) + 1
                """,
                hash=fingerprint_hash,
                ua=user_agent,
            )

            # Merge IP node
            session.run(
                """
                MERGE (ip:IP {address: $address})
                  ON CREATE SET ip.first_seen = datetime(), ip.is_flagged = $is_flagged,
                               ip.city = $city
                  ON MATCH  SET ip.last_seen = datetime()
                """,
                address=ip_address,
                is_flagged=is_flagged,
                city=city,
            )

            # Relationships
            session.run(
                """
                MATCH (u:User {customer_id: $cid}), (d:Device {hash: $hash})
                MERGE (u)-[:USES]->(d)
                """,
                cid=customer_id,
                hash=fingerprint_hash,
            )
            session.run(
                """
                MATCH (u:User {customer_id: $cid}), (ip:IP {address: $addr})
                MERGE (u)-[:LOGGED_FROM]->(ip)
                """,
                cid=customer_id,
                addr=ip_address,
            )

            # Email node (if provided)
            if email:
                session.run(
                    """
                    MERGE (e:Email {address: $email})
                    WITH e
                    MATCH (u:User {customer_id: $cid})
                    MERGE (u)-[:HAS_EMAIL]->(e)
                    """,
                    email=email,
                    cid=customer_id,
                )

            # Fraud ring creation
            if is_fraud_flagged:
                ring_id = f"ring_{ip_address.replace('.', '_')}"
                session.run(
                    """
                    MERGE (f:FraudRing {id: $ring_id})
                      ON CREATE SET f.detected_at = datetime(), f.severity = 'HIGH'
                    WITH f
                    MATCH (u:User {customer_id: $cid})
                    MERGE (u)-[:SUSPECTED_MEMBER_OF]->(f)
                    """,
                    ring_id=ring_id,
                    cid=customer_id,
                )
                session.run(
                    """
                    MATCH (f:FraudRing {id: $ring_id}), (ip:IP {address: $addr})
                    MERGE (ip)-[:ASSOCIATED_WITH]->(f)
                    """,
                    ring_id=ring_id,
                    addr=ip_address,
                )
                session.run(
                    """
                    MATCH (f:FraudRing {id: $ring_id}), (d:Device {hash: $hash})
                    MERGE (d)-[:LINKED_TO]->(f)
                    """,
                    ring_id=ring_id,
                    hash=fingerprint_hash,
                )

        logger.info(f"Graph updated for {customer_id} (fraud_flagged={is_fraud_flagged})")

    except Exception as e:
        logger.error(f"Neo4j write failed: {e}")


def read_graph_nodes(filter_type: str = "all") -> dict:
    """
    Read nodes and edges from Neo4j for the D3 visualization.

    Parameters
    ----------
    filter_type : str
        "all" — return everything (limit 300)
        "fraud_only" — only paths touching FraudRing nodes (limit 200)

    Returns
    -------
    dict with 'nodes' and 'edges' lists.
    """
    driver = get_neo4j_driver()
    nodes_map: dict[str, dict] = {}
    edges_list: list[dict] = []

    try:
        with driver.session() as session:
            if filter_type == "fraud_only":
                result = session.run(
                    """
                    MATCH (n)-[r]-(m)
                    WHERE n:FraudRing OR m:FraudRing
                    RETURN n, r, m LIMIT 200
                    """
                )
            else:
                result = session.run(
                    """
                    MATCH (n)-[r]-(m)
                    RETURN n, r, m LIMIT 300
                    """
                )

            for record in result:
                n_node = record["n"]
                m_node = record["m"]
                rel = record["r"]

                for node in [n_node, m_node]:
                    node_id = str(node.element_id)
                    if node_id not in nodes_map:
                        labels = list(node.labels)
                        node_type = labels[0] if labels else "UNKNOWN"
                        # Map Neo4j labels to frontend types
                        type_map = {
                            "User": "USER", "Device": "DEVICE",
                            "IP": "IP", "Email": "EMAIL",
                            "FraudRing": "FRAUD_RING",
                        }
                        mapped_type = type_map.get(node_type, node_type)

                        # Build label
                        props = dict(node)
                        if mapped_type == "USER":
                            label = props.get("name", props.get("customer_id", node_id))
                        elif mapped_type == "DEVICE":
                            ua = props.get("user_agent", "")
                            label = ua[:30] if ua else props.get("hash", node_id)[:12]
                        elif mapped_type == "IP":
                            label = props.get("address", node_id)
                        elif mapped_type == "EMAIL":
                            label = props.get("address", node_id)
                        elif mapped_type == "FRAUD_RING":
                            label = f"Ring {props.get('id', node_id)}"
                        else:
                            label = str(node_id)

                        risk_flag = mapped_type == "FRAUD_RING" or props.get("is_flagged", False)

                        nodes_map[node_id] = {
                            "id": node_id,
                            "type": mapped_type,
                            "label": label,
                            "risk_flag": risk_flag,
                            "connections": 0,
                        }

                # Edge
                source_id = str(rel.start_node.element_id)
                target_id = str(rel.end_node.element_id)
                rel_type = rel.type

                suspicious = rel_type in ("SUSPECTED_MEMBER_OF", "ASSOCIATED_WITH", "LINKED_TO")
                edges_list.append({
                    "source": source_id,
                    "target": target_id,
                    "relationship": rel_type,
                    "suspicious": suspicious,
                })

                # Increment connection counts
                if source_id in nodes_map:
                    nodes_map[source_id]["connections"] += 1
                if target_id in nodes_map:
                    nodes_map[target_id]["connections"] += 1

    except Exception as e:
        logger.error(f"Neo4j read failed: {e}")

    # Deduplicate edges
    seen_edges: set[str] = set()
    unique_edges = []
    for edge in edges_list:
        key = f"{edge['source']}-{edge['target']}-{edge['relationship']}"
        rev_key = f"{edge['target']}-{edge['source']}-{edge['relationship']}"
        if key not in seen_edges and rev_key not in seen_edges:
            seen_edges.add(key)
            unique_edges.append(edge)

    return {
        "nodes": list(nodes_map.values()),
        "edges": unique_edges,
    }
