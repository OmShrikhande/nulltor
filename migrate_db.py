import asyncio
import asyncpg
import os

async def migrate():
    print("Connecting to postgres to ensure 'NullTor_db' database exists...")
    try:
        conn = await asyncpg.connect(user='postgres', password='postgres', host='localhost', port=5433, database='postgres')
        exists = await conn.fetchval("SELECT 1 FROM pg_database WHERE datname = 'NullTor_db'")
        if not exists:
            print("Creating database 'NullTor_db'...")
            await conn.execute('CREATE DATABASE "NullTor_db"')
        else:
            print("Database 'NullTor_db' already exists.")
        await conn.close()
    except Exception as e:
        print(f"Error during database creation: {e}")
        return

    print("Connecting to 'NullTor_db' database...")
    try:
        conn = await asyncpg.connect(user='postgres', password='postgres', host='localhost', port=5433, database='NullTor_db')
        
        with open('schema.sql', 'r', encoding='utf-8') as f:
            schema_sql = f.read()
            
        print("Executing schema.sql...")
        await conn.execute(schema_sql)
        print("Migration successful!")
        
        await conn.close()
    except Exception as e:
        print(f"Error running schema migration: {e}")

if __name__ == '__main__':
    asyncio.run(migrate())
