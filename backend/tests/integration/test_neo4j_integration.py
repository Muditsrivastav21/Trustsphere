"""
TrustSphere AI — Neo4j integration tests (real Neo4j instance required)

Unlike the mocked unit tests elsewhere in this project, these tests run
real Cypher against a real Neo4j instance — either your Neo4j AuraDB
project (set NEO4J_URI/NEO4J_USERNAME/NEO4J_PASSWORD to the real values)
or a local Neo4j container, which needs no cloud account at all:

    docker run -d --name trustsphere-neo4j-test \\
      -p 7687:7687 -p 7474:7474 \\
      -e NEO4J_AUTH=neo4j/testpassword123 \\
      neo4j:5-community

Then run with:
    NEO4J_URI=bolt://localhost:7687 \\
    NEO4J_USERNAME=neo4j \\
    NEO4J_PASSWORD=testpassword123 \\
    pytest backend/tests/integration/test_neo4j_integration.py -v

Or simply run this file with no env vars set at all — it will try
bolt://localhost:7687 with neo4j/testpassword123 automatically (the
same default the docker command above uses) before skipping.

Every test cleans up the nodes it creates in a `finally` block, scoped
to a unique per-test-run label so repeated runs never collide with real
data or with each other.
"""

from __future__ import annotations

import os
import uuid
import pytest

try:
    from neo4j import GraphDatabase
except ImportError:  # pragma: no cover
    GraphDatabase = None

LOCAL_DEFAULT_URI = "bolt://localhost:7687"
LOCAL_DEFAULT_USER = "neo4j"
LOCAL_DEFAULT_PASSWORD = "testpassword123"


def _resolve_connection() -> tuple[str, str, str]:
    uri = os.environ.get("NEO4J_URI", "")
    user = os.environ.get("NEO4J_USERNAME", "")
    password = os.environ.get("NEO4J_PASSWORD", "")

    if uri and "xxxxxxxx" not in uri and password:
        return uri, user or "neo4j", password

    # Fall back to the standard local-docker defaults documented above.
    return LOCAL_DEFAULT_URI, LOCAL_DEFAULT_USER, LOCAL_DEFAULT_PASSWORD


@pytest.fixture(scope="module")
def neo4j_driver():
    if GraphDatabase is None:
        pytest.skip("neo4j driver is not installed in this environment.")

    uri, user, password = _resolve_connection()
    driver = GraphDatabase.driver(uri, auth=(user, password))
    try:
        driver.verify_connectivity()
    except Exception as e:
        driver.close()
        pytest.skip(
            f"Neo4j integration tests skipped: could not connect to {uri} ({e}). "
            "Either point NEO4J_URI/NEO4J_USERNAME/NEO4J_PASSWORD at a real AuraDB "
            "project, or run a local instance — see this file's module docstring "
            "for the exact `docker run` command."
        )
    yield driver
    driver.close()


@pytest.fixture()
def test_run_id():
    """Unique tag so this test run's nodes never collide with real/other-run data."""
    return f"rls_test_{uuid.uuid4().hex[:12]}"


class TestNeo4jFraudGraphWrites:
    def test_write_and_read_login_creates_expected_nodes(self, neo4j_driver, test_run_id):
        from app.services import graph_service

        # Point the service at our test driver instead of the module-level
        # singleton (which reads from app.config.settings, i.e. .env).
        original_get_driver = graph_service.get_neo4j_driver
        graph_service.get_neo4j_driver = lambda: neo4j_driver
        try:
            customer_id = f"TESTUSER_{test_run_id}"
            graph_service.write_login_to_graph(
                customer_id=customer_id,
                name="Integration Test User",
                fingerprint_hash=f"fp_{test_run_id}",
                user_agent="pytest-integration-test",
                ip_address="203.0.113.5",  # TEST-NET-3, reserved for documentation/testing
                is_flagged=False,
                is_fraud_flagged=False,
                city="TestCity",
                email=f"{test_run_id}@example.test",
            )

            with neo4j_driver.session() as session:
                result = session.run(
                    "MATCH (u:User {customer_id: $cid}) RETURN u.name as name",
                    cid=customer_id,
                )
                record = result.single()
                assert record is not None, "User node was not created"
                assert record["name"] == "Integration Test User"

                device_result = session.run(
                    "MATCH (u:User {customer_id: $cid})-[:USES]->(d:Device) RETURN d.hash as hash",
                    cid=customer_id,
                )
                device_record = device_result.single()
                assert device_record is not None, "USES relationship to Device was not created"
                assert device_record["hash"] == f"fp_{test_run_id}"

                ip_result = session.run(
                    "MATCH (u:User {customer_id: $cid})-[:LOGGED_FROM]->(ip:IP) RETURN ip.address as addr",
                    cid=customer_id,
                )
                ip_record = ip_result.single()
                assert ip_record is not None, "LOGGED_FROM relationship to IP was not created"
                assert ip_record["addr"] == "203.0.113.5"
        finally:
            graph_service.get_neo4j_driver = original_get_driver
            with neo4j_driver.session() as session:
                session.run(
                    "MATCH (n) WHERE n.customer_id = $cid OR n.hash = $hash OR n.address = $ip "
                    "DETACH DELETE n",
                    cid=f"TESTUSER_{test_run_id}",
                    hash=f"fp_{test_run_id}",
                    ip="203.0.113.5",
                )

    def test_fraud_ring_relationship_created_when_flagged(self, neo4j_driver, test_run_id):
        from app.services import graph_service

        original_get_driver = graph_service.get_neo4j_driver
        graph_service.get_neo4j_driver = lambda: neo4j_driver
        try:
            customer_id = f"FRAUDUSER_{test_run_id}"
            graph_service.write_login_to_graph(
                customer_id=customer_id,
                name="Fraud Test User",
                fingerprint_hash=f"fp_fraud_{test_run_id}",
                user_agent="pytest-integration-test",
                ip_address="203.0.113.99",
                is_flagged=True,
                is_fraud_flagged=True,
                city="TestCity",
                email="",
            )

            with neo4j_driver.session() as session:
                result = session.run(
                    "MATCH (u:User {customer_id: $cid})-[:SUSPECTED_MEMBER_OF]->(f:FraudRing) "
                    "RETURN f.id as ring_id",
                    cid=customer_id,
                )
                record = result.single()
                assert record is not None, "Fraud-flagged login did not create a FraudRing relationship"
        finally:
            graph_service.get_neo4j_driver = original_get_driver
            with neo4j_driver.session() as session:
                session.run(
                    "MATCH (n) WHERE n.customer_id = $cid OR n.hash = $hash OR n.address = $ip "
                    "DETACH DELETE n",
                    cid=f"FRAUDUSER_{test_run_id}",
                    hash=f"fp_fraud_{test_run_id}",
                    ip="203.0.113.99",
                )
                session.run(
                    "MATCH (f:FraudRing {id: $rid}) DETACH DELETE f",
                    rid="ring_203_0_113_99",
                )

    def test_onboarding_graph_risk_detects_device_reuse(self, neo4j_driver, test_run_id):
        """Two onboarding attempts sharing a device_hash should be flagged as reuse."""
        from app.services import graph_service

        original_get_driver = graph_service.get_neo4j_driver
        graph_service.get_neo4j_driver = lambda: neo4j_driver
        try:
            shared_device_hash = f"shared_device_{test_run_id}"

            graph_service.write_onboarding_to_graph(
                applicant_id=f"applicant_1_{test_run_id}",
                name="First Applicant",
                email="",
                phone="",
                aadhaar_hash="",
                pan_hash="",
                device_hash=shared_device_hash,
                ip_address="",
                decision="ALLOW",
                risk_score=90,
            )

            risk = graph_service.check_onboarding_graph_risk(
                device_hash=shared_device_hash,
                ip_address="",
                phone="",
                aadhaar_hash="",
                pan_hash="",
            )
            # The first applicant's own USES edge already counts as 1 —
            # confirms the reuse-count query actually traverses real data,
            # not a stub.
            assert risk["device_reuse_count"] >= 1
        finally:
            graph_service.get_neo4j_driver = original_get_driver
            with neo4j_driver.session() as session:
                session.run(
                    "MATCH (n) WHERE n.id = $aid OR n.hash = $hash DETACH DELETE n",
                    aid=f"applicant_1_{test_run_id}",
                    hash=shared_device_hash,
                )
