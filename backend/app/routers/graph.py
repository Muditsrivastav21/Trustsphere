"""
TrustSphere AI — Graph Router
GET /api/graph/nodes           — nodes + edges for D3 visualization
GET /api/graph/node/{node_id}  — detail for one node
"""

from __future__ import annotations

from fastapi import APIRouter, Query
from app.services.graph_service import read_graph_nodes
from app.models.responses import GraphResponse

router = APIRouter()


@router.get("/nodes", response_model=GraphResponse)
async def get_graph_nodes(filter: str = Query("all")):
    """
    Return graph nodes and edges for the D3 force layout.
    filter = 'all' | 'fraud_only'
    """
    data = read_graph_nodes(filter_type=filter)
    return GraphResponse(
        nodes=data["nodes"],
        edges=data["edges"],
    )


@router.post("/simulate")
async def post_simulate_fraud_ring():
    """
    Inject simulated fraud ring into Neo4j/Mock DB.
    """
    from app.services.graph_service import simulate_fraud_ring
    res = simulate_fraud_ring()
    return res
