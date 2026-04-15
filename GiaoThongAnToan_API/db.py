import pyodbc
from dotenv import load_dotenv
import os

load_dotenv()


def get_db():
    conn_str = (
        "DRIVER={ODBC Driver 17 for SQL Server};"
        f"SERVER={os.getenv('DB_SERVER')};"
        f"DATABASE={os.getenv('DB_NAME')};"
        "Trusted_Connection=yes;"
        "Encrypt=no;"
        "Connection Timeout=30;"
    )
    return pyodbc.connect(conn_str)
