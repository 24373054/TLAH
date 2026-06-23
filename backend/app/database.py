from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
    echo=False,
)

# Enable WAL mode for better concurrency (needed for agent sandbox)
if "sqlite" in settings.database_url:
    from sqlalchemy import event as _event

    @_event.listens_for(engine, "connect")
    def _set_wal(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables. Called on startup."""
    Base.metadata.create_all(bind=engine)


def migrate_db():
    """Apply schema migrations for existing databases."""
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    if "turns" not in inspector.get_table_names():
        return

    cols = {c["name"] for c in inspector.get_columns("turns")}

    if "parent_turn_id" not in cols:
        with engine.connect() as conn:
            conn.execute(text(
                "ALTER TABLE turns ADD COLUMN parent_turn_id VARCHAR(36) REFERENCES turns(id)"
            ))
            conn.commit()

    if "turn_type" not in cols:
        with engine.connect() as conn:
            conn.execute(text(
                "ALTER TABLE turns ADD COLUMN turn_type VARCHAR(20) DEFAULT 'reply'"
            ))
            conn.commit()

    # GlobalSettings: decision loop parameters
    if "global_settings" in inspector.get_table_names():
        gs_cols = {c["name"] for c in inspector.get_columns("global_settings")}
        new_cols = {
            "debounce_seconds": "FLOAT DEFAULT 2.0",
            "max_pending_messages": "INTEGER DEFAULT 10",
            "max_wait_seconds": "INTEGER DEFAULT 30",
            "max_reply_messages": "INTEGER DEFAULT 5",
        }
        for col_name, col_def in new_cols.items():
            if col_name not in gs_cols:
                with engine.connect() as conn:
                    conn.execute(text(
                        f"ALTER TABLE global_settings ADD COLUMN {col_name} {col_def}"
                    ))
                    conn.commit()

    # Chat: agent_enabled, agent_max_iterations
    if "chats" in inspector.get_table_names():
        chat_cols = {c["name"] for c in inspector.get_columns("chats")}
        if "agent_enabled" not in chat_cols:
            with engine.connect() as conn:
                conn.execute(text(
                    "ALTER TABLE chats ADD COLUMN agent_enabled BOOLEAN DEFAULT 1"
                ))
                conn.commit()
        if "agent_max_iterations" not in chat_cols:
            with engine.connect() as conn:
                conn.execute(text(
                    "ALTER TABLE chats ADD COLUMN agent_max_iterations INTEGER DEFAULT 10"
                ))
                conn.commit()

    # Message: message_type, metadata_json
    if "messages" in inspector.get_table_names():
        msg_cols = {c["name"] for c in inspector.get_columns("messages")}
        if "message_type" not in msg_cols:
            with engine.connect() as conn:
                conn.execute(text(
                    "ALTER TABLE messages ADD COLUMN message_type VARCHAR(20) DEFAULT 'text'"
                ))
                conn.commit()
        if "metadata_json" not in msg_cols:
            with engine.connect() as conn:
                conn.execute(text(
                    "ALTER TABLE messages ADD COLUMN metadata_json TEXT"
                ))
                conn.commit()
