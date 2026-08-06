# Generating a Graph Demo Backup

If Neo4j AuraDB experiences latency or connectivity issues during the live demo, it is essential to have a pre-recorded backup video of the graph visualization. This guide outlines exactly how to generate a realistic-looking backup.

## Prerequisites

Ensure your backend and database are running and seeded with realistic data.
1. Run the database seed scripts:
   ```bash
   cd backend
   python scripts/seed_supabase.py
   python scripts/seed_neo4j.py
   ```
   *(Note: `seed_neo4j.py` will populate AuraDB with connected users, devices, and IPs, naturally forming a "fraud ring" based on shared credentials.)*

2. Start the frontend and backend servers:
   ```bash
   # Terminal 1
   cd backend
   uvicorn main:app --port 8001
   
   # Terminal 2
   cd frontend
   npm run dev
   ```

## Recording Steps

Use a screen recording tool (like OBS, QuickTime, or Windows Game Bar) to capture a 15-20 second loop.

1. **Setup the View**: Open the frontend at `http://localhost:5173` (or `8080`) and navigate to the **Fraud Graph** page.
2. **Initial State**: Start recording. Click the **"Fraud Only"** filter button at the top to isolate the suspicious clusters.
3. **Graph Interaction**:
   - Slowly click and drag the canvas to rotate the 3D graph, showcasing the connections between the `FRAUD_RING` node, the `DEVICE`, and the compromised `USER` nodes.
   - Zoom in slightly to make the nodes clearer.
   - Click on the central red `FRAUD_RING` node so the **Node Inspector** sidebar opens on the right.
   - The inspector will display "Risk Posture: High Risk" and "Fraud Ring Member". Hold this view for 3-5 seconds.
4. **Final Polish**: Click a connected `USER` node to show the relationship updating in the inspector.
5. **Stop Recording**: End the screen capture. 

Save the video file as `fraud_graph_demo_backup.mp4` in a safe location, ready to drop into your presentation slides if needed.
