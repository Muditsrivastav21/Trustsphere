"""
TrustSphere AI — Neo4j AuraDB Client Singleton
Manages the lifecycle of the async Neo4j driver.
"""

from neo4j import GraphDatabase, Driver
from app.config.settings import settings

_driver: Driver | None = None


def get_neo4j_driver() -> Driver:
    """Return a cached Neo4j driver instance."""
    global _driver
    if _driver is None:
        _driver = GraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD),
        )
    return _driver


def close_neo4j_driver():
    """Close the driver when the application shuts down."""
    global _driver
    if _driver is not None:
        _driver.close()
        _driver = None
