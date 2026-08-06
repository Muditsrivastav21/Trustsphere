"""
TrustSphere AI — Neo4j Seeder
Seeds the Neo4j graph with pre-existing users, devices, IPs,
and a fraud ring so the D3 graph looks rich immediately.

Run:  python scripts/seed_neo4j.py
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database.neo4j_client import get_neo4j_driver, close_neo4j_driver


def seed():
    driver = get_neo4j_driver()

    users = [
        ("BOB001", "Rahul Sharma", "Lucknow", "rahul.sharma@email.com"),
        ("BOB002", "Priya Mehta", "Mumbai", "priya.mehta@email.com"),
        ("BOB003", "Arvind Kapoor", "Delhi", "arvind.kapoor@email.com"),
        ("BOB004", "Sneha Iyer", "Bengaluru", "sneha.iyer@email.com"),
        ("BOB005", "Mohammed Raza", "Hyderabad", "mohammed.raza@email.com"),
        ("BOB006", "Aarti Patel", "Ahmedabad", "aarti.patel@email.com"),
        ("BOB007", "Karan Tandon", "Jaipur", "karan.tandon@email.com"),
        ("BOB008", "Divya Nair", "Chennai", "divya.nair@email.com"),
    ]

    devices = [
        ("fp_mac_chrome_001", "MacBook Pro · Chrome/125"),
        ("fp_iphone_safari_002", "iPhone 15 · Safari/604"),
        ("fp_win_chrome_003", "Windows 11 · Chrome/125"),
        ("fp_pixel_chrome_004", "Pixel 8 · Chrome/125"),
        ("fp_ipad_safari_005", "iPad · Safari/604"),
    ]

    ips = [
        ("103.21.124.8", "Lucknow", False),
        ("49.207.211.17", "Pune", False),
        ("182.74.99.10", "Mumbai", False),
        ("45.33.32.156", "San Jose", True),   # flagged — KNOWN_ATTACKER
    ]

    with driver.session() as session:
        # Clear existing data
        session.run("MATCH (n) DETACH DELETE n")
        print("  Cleared existing Neo4j data")

        # Create users
        for cid, name, city, email in users:
            session.run(
                """
                CREATE (u:User {customer_id: $cid, name: $name, city: $city})
                """,
                cid=cid, name=name, city=city,
            )
            session.run(
                """
                MATCH (u:User {customer_id: $cid})
                CREATE (e:Email {address: $email})
                CREATE (u)-[:HAS_EMAIL]->(e)
                """,
                cid=cid, email=email,
            )

        # Create devices and link to users
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

        for hash_val, ua in devices:
            session.run(
                """
                CREATE (d:Device {hash: $hash, user_agent: $ua, login_count: $cnt})
                """,
                hash=hash_val, ua=ua, cnt=3,
            )

        for cid, dev_hash in user_device_mapping:
            session.run(
                """
                MATCH (u:User {customer_id: $cid}), (d:Device {hash: $hash})
                CREATE (u)-[:USES]->(d)
                """,
                cid=cid, hash=dev_hash,
            )

        # Create IPs and link
        user_ip_mapping = [
            ("BOB001", "103.21.124.8"),
            ("BOB002", "49.207.211.17"),
            ("BOB003", "182.74.99.10"),
            ("BOB004", "103.21.124.8"),
            ("BOB005", "49.207.211.17"),
            ("BOB006", "182.74.99.10"),
            ("BOB007", "45.33.32.156"),     # flagged IP
            ("BOB008", "45.33.32.156"),     # flagged IP — same as BOB007
        ]

        for addr, city, flagged in ips:
            session.run(
                """
                CREATE (ip:IP {address: $addr, city: $city, is_flagged: $flagged})
                """,
                addr=addr, city=city, flagged=flagged,
            )

        for cid, addr in user_ip_mapping:
            session.run(
                """
                MATCH (u:User {customer_id: $cid}), (ip:IP {address: $addr})
                CREATE (u)-[:LOGGED_FROM]->(ip)
                """,
                cid=cid, addr=addr,
            )

        # Create a fraud ring
        session.run(
            """
            CREATE (f:FraudRing {id: 'ring_45_33_32_156', severity: 'HIGH'})
            """
        )

        # Link suspicious users and IP to fraud ring
        for cid in ["BOB007", "BOB008"]:
            session.run(
                """
                MATCH (u:User {customer_id: $cid}), (f:FraudRing {id: $rid})
                CREATE (u)-[:SUSPECTED_MEMBER_OF]->(f)
                """,
                cid=cid, rid="ring_45_33_32_156",
            )

        session.run(
            """
            MATCH (ip:IP {address: '45.33.32.156'}), (f:FraudRing {id: $rid})
            CREATE (ip)-[:ASSOCIATED_WITH]->(f)
            """,
            rid="ring_45_33_32_156",
        )

        session.run(
            """
            MATCH (d:Device {hash: 'fp_pixel_chrome_004'}), (f:FraudRing {id: $rid})
            CREATE (d)-[:LINKED_TO]->(f)
            """,
            rid="ring_45_33_32_156",
        )

    print(f"✓ Seeded Neo4j with {len(users)} users, {len(devices)} devices, {len(ips)} IPs, 1 fraud ring")
    close_neo4j_driver()


if __name__ == "__main__":
    seed()
