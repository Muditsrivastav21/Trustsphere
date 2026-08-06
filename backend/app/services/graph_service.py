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


# In-memory mock database state
_mock_nodes: list[dict] = []
_mock_edges: list[dict] = []
_fraud_simulated = False

def initialize_mock_graph():
    global _mock_nodes, _mock_edges
    if _mock_nodes:
        return
    
    users = [
        {"cid": "BOB001", "name": "Rahul Sharma", "city": "Lucknow", "email": "rahul.sharma@email.com"},
        {"cid": "BOB002", "name": "Priya Mehta", "city": "Mumbai", "email": "priya.mehta@email.com"},
        {"cid": "BOB003", "name": "Arvind Kapoor", "city": "Delhi", "email": "arvind.kapoor@email.com"},
        {"cid": "BOB004", "name": "Sneha Iyer", "city": "Bengaluru", "email": "sneha.iyer@email.com"},
        {"cid": "BOB005", "name": "Mohammed Raza", "city": "Hyderabad", "email": "mohammed.raza@email.com"},
        {"cid": "BOB006", "name": "Aarti Patel", "city": "Ahmedabad", "email": "aarti.patel@email.com"},
        {"cid": "BOB007", "name": "Karan Tandon", "city": "Jaipur", "email": "karan.tandon@email.com"},
        {"cid": "BOB008", "name": "Divya Nair", "city": "Chennai", "email": "divya.nair@email.com"},
    ]
    devices = [
        {"hash": "fp_mac_chrome_001", "ua": "MacBook Pro · Chrome/125"},
        {"hash": "fp_iphone_safari_002", "ua": "iPhone 15 · Safari/604"},
        {"hash": "fp_win_chrome_003", "ua": "Windows 11 · Chrome/125"},
        {"hash": "fp_pixel_chrome_004", "ua": "Pixel 8 · Chrome/125"},
        {"hash": "fp_ipad_safari_005", "ua": "iPad · Safari/604"},
    ]
    ips = [
        {"addr": "103.21.124.8", "city": "Lucknow", "flagged": False},
        {"addr": "49.207.211.17", "city": "Pune", "flagged": False},
        {"addr": "182.74.99.10", "city": "Mumbai", "flagged": False},
        {"addr": "45.33.32.156", "city": "San Jose", "flagged": True},
    ]

    # Create Node mappings
    for u in users:
        _mock_nodes.append({
            "id": u["cid"],
            "type": "USER",
            "label": u["name"],
            "risk_flag": False,
            "connections": 0
        })
        _mock_nodes.append({
            "id": u["email"],
            "type": "EMAIL",
            "label": u["email"],
            "risk_flag": False,
            "connections": 0
        })
        _mock_edges.append({
            "source": u["cid"],
            "target": u["email"],
            "relationship": "HAS_EMAIL",
            "suspicious": False
        })
        
    for d in devices:
        _mock_nodes.append({
            "id": d["hash"],
            "type": "DEVICE",
            "label": d["ua"][:30],
            "risk_flag": False,
            "connections": 0
        })

    for ip in ips:
        _mock_nodes.append({
            "id": ip["addr"],
            "type": "IP",
            "label": ip["addr"],
            "risk_flag": ip["flagged"],
            "connections": 0
        })

    user_device_mapping = [
        ("BOB001", "fp_mac_chrome_001"),
        ("BOB001", "fp_win_chrome_003"),
        ("BOB002", "fp_iphone_safari_002"),
        ("BOB003", "fp_win_chrome_003"),
        ("BOB003", "fp_pixel_chrome_004"),
        ("BOB004", "fp_ipad_safari_005"),
        ("BOB005", "fp_mac_chrome_001"),
        ("BOB006", "fp_iphone_safari_002"),
        ("BOB007", "fp_pixel_chrome_004"),
        ("BOB008", "fp_win_chrome_003"),
    ]
    for cid, dev_hash in user_device_mapping:
        _mock_edges.append({
            "source": cid,
            "target": dev_hash,
            "relationship": "USES",
            "suspicious": False
        })

    user_ip_mapping = [
        ("BOB001", "103.21.124.8"),
        ("BOB002", "49.207.211.17"),
        ("BOB003", "182.74.99.10"),
        ("BOB004", "103.21.124.8"),
        ("BOB005", "49.207.211.17"),
        ("BOB006", "182.74.99.10"),
        ("BOB007", "45.33.32.156"),
        ("BOB008", "45.33.32.156"),
    ]
    for cid, addr in user_ip_mapping:
        _mock_edges.append({
            "source": cid,
            "target": addr,
            "relationship": "LOGGED_FROM",
            "suspicious": False
        })

    # Base Fraud Ring
    _mock_nodes.append({
        "id": "ring_45_33_32_156",
        "type": "FRAUD_RING",
        "label": "Ring ring_45_33_32_156",
        "risk_flag": True,
        "connections": 0
    })
    for cid in ["BOB007", "BOB008"]:
        _mock_edges.append({
            "source": cid,
            "target": "ring_45_33_32_156",
            "relationship": "SUSPECTED_MEMBER_OF",
            "suspicious": True
        })
        # Mark users in fraud ring as suspicious/risk_flag
        for node in _mock_nodes:
            if node["id"] == cid:
                node["risk_flag"] = True
                
    _mock_edges.append({
        "source": "45.33.32.156",
        "target": "ring_45_33_32_156",
        "relationship": "ASSOCIATED_WITH",
        "suspicious": True
    })
    _mock_edges.append({
        "source": "fp_pixel_chrome_004",
        "target": "ring_45_33_32_156",
        "relationship": "LINKED_TO",
        "suspicious": True
    })
    # Mark device as risk_flag
    for node in _mock_nodes:
        if node["id"] == "fp_pixel_chrome_004":
            node["risk_flag"] = True

    recompute_mock_connections()

def recompute_mock_connections():
    global _mock_nodes, _mock_edges
    conn_map = {}
    for edge in _mock_edges:
        src = edge["source"]
        tgt = edge["target"]
        conn_map[src] = conn_map.get(src, 0) + 1
        conn_map[tgt] = conn_map.get(tgt, 0) + 1
    for node in _mock_nodes:
        node["connections"] = conn_map.get(node["id"], 0)

def simulate_fraud_ring_in_mock():
    global _mock_nodes, _mock_edges, _fraud_simulated
    if _fraud_simulated:
        return
    _fraud_simulated = True
    malicious_ip_id = "ip_malicious_99"
    _mock_nodes.append({
        "id": malicious_ip_id,
        "type": "FRAUD_RING",
        "label": "Malicious IP (Botnet)",
        "risk_flag": True,
        "connections": 0
    })
    for i in range(20):
        fake_user_id = f"synthetic_user_{i}"
        _mock_nodes.append({
            "id": fake_user_id,
            "type": "USER",
            "label": f"Synthetic Mule {i}",
            "risk_flag": True,
            "connections": 0
        })
        _mock_edges.append({
            "source": malicious_ip_id,
            "target": fake_user_id,
            "relationship": "MASS_CREATION",
            "suspicious": True
        })
    # Takeover attempt on an existing user (e.g. BOB001)
    _mock_edges.append({
        "source": malicious_ip_id,
        "target": "BOB001",
        "relationship": "ATO_ATTEMPT",
        "suspicious": True
    })
    recompute_mock_connections()


def simulate_fraud_ring() -> dict:
    """
    Simulate a fraud ring by inserting nodes into Neo4j (if available)
    and/or updating the in-memory mock fallback graph.
    """
    initialize_mock_graph()
    simulate_fraud_ring_in_mock()
    
    driver = get_neo4j_driver()
    neo4j_success = False
    try:
        with driver.session() as session:
            malicious_ip_id = "ip_malicious_99"
            session.run(
                """
                MERGE (f:FraudRing {id: $rid})
                  ON CREATE SET f.detected_at = datetime(), f.severity = 'CRITICAL', f.label = 'Malicious IP (Botnet)'
                """,
                rid=malicious_ip_id
            )
            for i in range(20):
                fake_user_id = f"synthetic_user_{i}"
                fake_name = f"Synthetic Mule {i}"
                session.run(
                    """
                    MERGE (u:User {customer_id: $cid})
                      ON CREATE SET u.name = $name, u.created_at = datetime(), u.is_flagged = true
                    WITH u
                    MATCH (f:FraudRing {id: $rid})
                    MERGE (u)-[:SUSPECTED_MEMBER_OF]->(f)
                    """,
                    cid=fake_user_id,
                    name=fake_name,
                    rid=malicious_ip_id
                )
            session.run(
                """
                MATCH (f:FraudRing {id: $rid}), (u:User)
                WHERE u.customer_id = 'BOB001'
                MERGE (u)-[:ATO_ATTEMPT]->(f)
                """,
                rid=malicious_ip_id
            )
        neo4j_success = True
        logger.info("Successfully simulated fraud ring in Neo4j database")
    except Exception as e:
        logger.error(f"Failed to simulate fraud ring in Neo4j: {e}")
        
    return {"status": "success", "neo4j": neo4j_success, "message": "Fraud ring simulated successfully"}


def read_graph_nodes(filter_type: str = "all") -> dict:
    """
    Read nodes and edges from Neo4j for the D3 visualization.
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
                        type_map = {
                            "User": "USER", "Device": "DEVICE",
                            "IP": "IP", "Email": "EMAIL",
                            "FraudRing": "FRAUD_RING",
                        }
                        mapped_type = type_map.get(node_type, node_type)

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

                source_id = str(rel.start_node.element_id)
                target_id = str(rel.end_node.element_id)
                rel_type = rel.type

                suspicious = rel_type in ("SUSPECTED_MEMBER_OF", "ASSOCIATED_WITH", "LINKED_TO", "ATO_ATTEMPT", "MASS_CREATION")
                edges_list.append({
                    "source": source_id,
                    "target": target_id,
                    "relationship": rel_type,
                    "suspicious": suspicious,
                })

                if source_id in nodes_map:
                    nodes_map[source_id]["connections"] += 1
                if target_id in nodes_map:
                    nodes_map[target_id]["connections"] += 1

        # Check if we actually loaded anything from Neo4j
        if not nodes_map:
            raise ValueError("No data returned from Neo4j session")

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

    except Exception as e:
        logger.error(f"Neo4j read failed, falling back to stateful mock: {e}")
        initialize_mock_graph()
        
        filtered_nodes = []
        filtered_edges = []
        
        if filter_type == "fraud_only":
            fraud_node_ids = {n["id"] for n in _mock_nodes if n["type"] == "FRAUD_RING" or n["risk_flag"]}
            for edge in _mock_edges:
                if edge["source"] in fraud_node_ids or edge["target"] in fraud_node_ids or edge["suspicious"]:
                    filtered_edges.append(edge)
            
            used_node_ids = {e["source"] for e in filtered_edges} | {e["target"] for e in filtered_edges}
            for node in _mock_nodes:
                if node["id"] in used_node_ids or node["type"] == "FRAUD_RING" or node["risk_flag"]:
                    filtered_nodes.append(node)
        else:
            filtered_nodes = _mock_nodes
            filtered_edges = _mock_edges
            
        return {
            "nodes": filtered_nodes,
            "edges": filtered_edges
        }
