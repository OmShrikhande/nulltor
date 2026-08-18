import sqlite3

conn = sqlite3.connect('backend/nulltor.db')
cur = conn.cursor()

print("=== All Projects in backend/nulltor.db ===")
cur.execute("SELECT id, name FROM projects")
for r in cur.fetchall():
    print(r)

print("\n=== All Branches in backend/nulltor.db ===")
cur.execute("SELECT id, project_id, name, type, is_active FROM branches")
for r in cur.fetchall():
    print(r)

print("\n=== Query with hex without hyphens ===")
branch_hex = '2e3f12d3-7667-4aa3-a015-48a3e19dda5f'.replace('-', '')
project_hex = 'd6bd4066-3107-499d-97c7-a84108d83386'.replace('-', '')
cur.execute("SELECT id, project_id, name, type, is_active FROM branches WHERE id=?", (branch_hex,))
print("Branch match without hyphens:", cur.fetchall())
cur.execute("SELECT id, name FROM projects WHERE id=?", (project_hex,))
print("Project match without hyphens:", cur.fetchall())

conn.close()
