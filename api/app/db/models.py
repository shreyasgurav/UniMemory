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


class Memory(Base):
    """Extracted memory with OpenMemory-style fields"""
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
    user_id = Column(String(100), index=True, default="anonymous")  # End-user ID (chatbot customer)
    owner_id = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)  # UniMemory user who owns this memory
    
    # Embeddings (pgvector)
    embedding = Column(Vector(1536))  # text-embedding-3-small = 1536 dims
    embedding_model = Column(String(50))
    
    # Status
    is_active = Column(Boolean, default=True, index=True)
    expires_at = Column(DateTime(timezone=True))
    
    # Relationships
    waypoints_from = relationship("Waypoint", foreign_keys="Waypoint.src_id", back_populates="source")
    waypoints_to = relationship("Waypoint", foreign_keys="Waypoint.dst_id", back_populates="target")
    
    # Indexes
    __table_args__ = (
        Index("idx_memories_salience", "salience", postgresql_ops={"salience": "DESC"}),
        Index("idx_memories_sector", "sector"),
        Index("idx_memories_user_id", "user_id"),
        Index("idx_memories_owner_id", "owner_id"),
        Index("idx_memories_created_at", "created_at", postgresql_ops={"created_at": "DESC"}),
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
    key_prefix = Column(String(20))  # First few chars for identification
    
    # User association
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Status
    is_active = Column(Boolean, default=True)
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

