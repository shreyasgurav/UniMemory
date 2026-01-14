"""
Database models for UniMemory API
"""
from sqlalchemy import Column, String, Text, Float, Integer, Boolean, DateTime, ForeignKey, Index, JSON
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
from datetime import datetime
import uuid

from app.db.database import Base


class EndUser(Base):
    """End users of API customers / consumer app users"""
    __tablename__ = "end_users"
    
    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    external_user_id = Column(String(255), nullable=False, index=True)  # user_id from API caller
    owner_id = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relationships
    owner = relationship("User")
    
    __table_args__ = (
        Index("idx_end_users_owner_external", "owner_id", "external_user_id", unique=True),
    )
    
    def __repr__(self):
        return f"<EndUser(id={self.id}, external_user_id={self.external_user_id})>"


class Source(Base):
    """Raw source data (chats, documents, web pages, code, files)"""
    __tablename__ = "sources"
    
    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_id = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    end_user_id = Column(UUID(as_uuid=False), ForeignKey("end_users.id", ondelete="SET NULL"), nullable=True, index=True)
    
    # Source classification
    type = Column(String(50), nullable=False, index=True)  # chat, document, web, code, file
    source_app = Column(String(100), index=True)  # chrome, vscode, chatgpt, slack, etc.
    title = Column(String(500))
    
    # Raw content (NEVER embedded directly)
    raw_content = Column(JSONB, nullable=False)  # Full raw data
    
    # Summary (embedded for semantic search)
    summary = Column(Text)  # LLM-generated summary
    summary_embedding = Column(Vector(1536))  # Embedded summary for RAG
    
    # Metadata
    source_metadata = Column(JSONB, default=dict)
    external_ref = Column(String(500))  # chat_id, file_path, url, etc.
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    owner = relationship("User")
    end_user = relationship("EndUser")
    
    __table_args__ = (
        Index("idx_sources_owner_type", "owner_id", "type"),
        Index("idx_sources_owner_app", "owner_id", "source_app"),
        Index("idx_sources_owner_created", "owner_id", "created_at"),
        Index("idx_sources_summary_embedding", "summary_embedding", postgresql_using="ivfflat", postgresql_with={"lists": 100}),
    )
    
    def __repr__(self):
        return f"<Source(id={self.id}, type={self.type}, app={self.source_app})>"


class Memory(Base):
    """Extracted memory (atomic, durable, reusable knowledge)"""
    __tablename__ = "memories"
    
    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    last_seen_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Content
    content = Column(Text, nullable=False)
    
    # OpenMemory fields
    simhash = Column(String(16), index=True)  # SimHash for deduplication
    sector = Column(String(20), index=True)   # semantic, episodic, procedural, emotional, reflective
    salience = Column(Float, default=0.5, index=True)  # Importance score (0.0 - 1.0)
    decay_lambda = Column(Float, default=0.02)  # Decay rate
    segment = Column(Integer, default=0)  # Memory segment number
    
    # Metadata
    tags = Column(JSONB, default=list)  # Tags array
    extra_metadata = Column(JSONB, default=dict)  # Additional metadata (renamed from 'metadata' to avoid SQLAlchemy conflict)
    
    # Source info
    source_app = Column(String(100))
    user_id = Column(String(100), index=True, default="anonymous")  # LEGACY: End-user ID string (kept for backward compat)
    end_user_id = Column(UUID(as_uuid=False), ForeignKey("end_users.id", ondelete="SET NULL"), nullable=True, index=True)  # NEW: FK to end_users table
    owner_id = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)  # UniMemory user who owns this memory
    api_key_id = Column(UUID(as_uuid=False), ForeignKey("api_keys.id", ondelete="SET NULL"), nullable=True, index=True)  # API Key used to create this memory
    
    # Embeddings (pgvector)
    embedding = Column(Vector(1536))  # text-embedding-3-small = 1536 dims
    embedding_model = Column(String(50))
    
    # Status
    is_active = Column(Boolean, default=True, index=True)
    expires_at = Column(DateTime(timezone=True))
    
    # Relationships
    waypoints_from = relationship("Waypoint", foreign_keys="Waypoint.src_id", back_populates="source")
    waypoints_to = relationship("Waypoint", foreign_keys="Waypoint.dst_id", back_populates="target")
    api_key = relationship("APIKey")
    end_user = relationship("EndUser")
    
    # Indexes - optimized for production queries
    __table_args__ = (
        # Single column indexes
        Index("idx_memories_salience", "salience", postgresql_ops={"salience": "DESC"}),
        Index("idx_memories_sector", "sector"),
        Index("idx_memories_user_id", "user_id"),
        Index("idx_memories_owner_id", "owner_id"),
        Index("idx_memories_api_key_id", "api_key_id"),
        Index("idx_memories_created_at", "created_at", postgresql_ops={"created_at": "DESC"}),
        Index("idx_memories_simhash", "simhash"),
        
        # Compound indexes for common query patterns
        Index("idx_memories_owner_user_active", "owner_id", "user_id", "is_active"),  # List memories
        Index("idx_memories_owner_api_key_active", "owner_id", "api_key_id", "is_active"),  # Filter by API key
        Index("idx_memories_owner_active_created", "owner_id", "is_active", "created_at"),  # Sorted list
        Index("idx_memories_owner_simhash", "owner_id", "simhash"),  # Deduplication
        
        # Vector index for similarity search
        Index("idx_memories_embedding", "embedding", postgresql_using="ivfflat", postgresql_with={"lists": 100}),
    )
    
    def __repr__(self):
        return f"<Memory(id={self.id}, content={self.content[:50]}...)>"


class Waypoint(Base):
    """Links between memories (graph edges)"""
    __tablename__ = "waypoints"
    
    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    src_id = Column(UUID(as_uuid=False), ForeignKey("memories.id", ondelete="CASCADE"), nullable=False)
    dst_id = Column(UUID(as_uuid=False), ForeignKey("memories.id", ondelete="CASCADE"), nullable=False)
    weight = Column(Float, default=0.5, nullable=False)  # Similarity weight (0.0 - 1.0)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    source = relationship("Memory", foreign_keys=[src_id], back_populates="waypoints_from")
    target = relationship("Memory", foreign_keys=[dst_id], back_populates="waypoints_to")
    
    # Indexes
    __table_args__ = (
        Index("idx_waypoints_src", "src_id"),
        Index("idx_waypoints_dst", "dst_id"),
        Index("idx_waypoints_weight", "weight", postgresql_ops={"weight": "DESC"}),
        Index("idx_waypoints_unique", "src_id", "dst_id", unique=True),
    )
    
    def __repr__(self):
        return f"<Waypoint(src={self.src_id}, dst={self.dst_id}, weight={self.weight})>"


class User(Base):
    """User accounts (Firebase authenticated)"""
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    firebase_uid = Column(String(128), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, index=True)
    display_name = Column(String(255))
    avatar_url = Column(String(500))
    
    # Account status
    account_type = Column(String(20), default="api")  # api, consumer
    plan = Column(String(50), default="free")  # free, pro, enterprise
    is_active = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    last_login_at = Column(DateTime(timezone=True))
    
    # Preferences
    settings = Column(JSONB, default=dict)
    
    # Relationships
    api_keys = relationship("APIKey", back_populates="user", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<User(id={self.id}, email={self.email})>"


class APIKey(Base):
    """API keys for user authentication"""
    __tablename__ = "api_keys"
    
    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    key_hash = Column(String(255), nullable=False)  # Hashed API key
    key_prefix = Column(String(20), index=True)  # First few chars for identification (indexed for fast lookup)
    
    # User association
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Status
    is_active = Column(Boolean, default=True, index=True)
    expires_at = Column(DateTime(timezone=True))
    
    # Usage tracking
    last_used_at = Column(DateTime(timezone=True))
    usage_count = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="api_keys")
    
    def __repr__(self):
        return f"<APIKey(id={self.id}, name={self.name})>"


class ProcessingLog(Base):
    """Log of memory processing operations"""
    __tablename__ = "processing_logs"
    
    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    raw_content_hash = Column(String(64), index=True)  # Hash of raw input
    processed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    was_worth_remembering = Column(Boolean, nullable=False)
    reason = Column(Text)
    extracted_count = Column(Integer, default=0)
    
    def __repr__(self):
        return f"<ProcessingLog(id={self.id}, worth={self.was_worth_remembering})>"


class MemorySource(Base):
    """Links memories to their original source data (N:N relationship)"""
    __tablename__ = "memory_sources"
    
    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    memory_id = Column(UUID(as_uuid=False), ForeignKey("memories.id", ondelete="CASCADE"), nullable=False, index=True)
    source_id = Column(UUID(as_uuid=False), ForeignKey("sources.id", ondelete="CASCADE"), nullable=False, index=True)  # FK to sources table
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relationships
    memory = relationship("Memory")
    source = relationship("Source")
    
    # Indexes
    __table_args__ = (
        Index("idx_memory_sources_memory", "memory_id"),
        Index("idx_memory_sources_source", "source_id"),
        Index("idx_memory_sources_unique", "memory_id", "source_id", unique=True),
    )
    
    def __repr__(self):
        return f"<MemorySource(memory={self.memory_id}, source={self.source_id})>"


class AgentSession(Base):
    """Agent/MCP session tracking for debug and explainability"""
    __tablename__ = "agent_sessions"
    
    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_id = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_name = Column(String(255))
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relationships
    owner = relationship("User")
    context_logs = relationship("AgentContextLog", back_populates="session", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<AgentSession(id={self.id}, agent={self.agent_name})>"


class AgentContextLog(Base):
    """Logs of context retrieved for agent sessions"""
    __tablename__ = "agent_context_logs"
    
    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(UUID(as_uuid=False), ForeignKey("agent_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    memory_ids = Column(JSONB, default=list)  # Array of memory UUIDs retrieved
    source_ids = Column(JSONB, default=list)  # Array of source UUIDs retrieved
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relationships
    session = relationship("AgentSession", back_populates="context_logs")
    
    def __repr__(self):
        return f"<AgentContextLog(session={self.session_id})>"


class MCPToken(Base):
    """MCP tokens for consumer users to connect AI agents (Cursor, Claude, VSCode, etc.)"""
    __tablename__ = "mcp_tokens"
    
    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Token identification
    name = Column(String(100), nullable=False)  # "Cursor", "Claude Desktop", etc.
    client_type = Column(String(50), nullable=False)  # cursor, claude, vscode, windsurf, custom
    token_hash = Column(String(255), nullable=False)  # Hashed token
    token_prefix = Column(String(20), index=True)  # First chars for identification
    
    # Status
    is_active = Column(Boolean, default=True, index=True)
    
    # Usage tracking
    last_used_at = Column(DateTime(timezone=True))
    usage_count = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relationships
    user = relationship("User")
    
    __table_args__ = (
        Index("idx_mcp_tokens_user_client", "user_id", "client_type"),
        Index("idx_mcp_tokens_prefix", "token_prefix"),
    )
    
    def __repr__(self):
        return f"<MCPToken(id={self.id}, name={self.name}, client={self.client_type})>"


class MCPActivity(Base):
    """Log of MCP tool calls for activity feed"""
    __tablename__ = "mcp_activity"
    
    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    mcp_token_id = Column(UUID(as_uuid=False), ForeignKey("mcp_tokens.id", ondelete="SET NULL"), nullable=True, index=True)
    
    # Tool call details
    tool_name = Column(String(100), nullable=False)  # search_memory, get_memory_context, get_source
    client_type = Column(String(50))  # cursor, claude, vscode, windsurf
    
    # Tool arguments (for context)
    tool_args = Column(JSONB, default=dict)  # query, memory_id, source_id, etc.
    
    # Results summary
    result_count = Column(Integer, default=0)  # Number of results returned
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    
    # Relationships
    user = relationship("User")
    mcp_token = relationship("MCPToken")
    
    __table_args__ = (
        Index("idx_mcp_activity_user_created", "user_id", "created_at"),
        Index("idx_mcp_activity_tool", "tool_name"),
    )
    
    def __repr__(self):
        return f"<MCPActivity(id={self.id}, tool={self.tool_name}, client={self.client_type})>"

