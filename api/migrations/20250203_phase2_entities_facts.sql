-- Phase 2: Create Entity and Fact Tables
-- Run this migration on Railway PostgreSQL after Phase 1

-- 1. ENTITIES TABLE
CREATE TABLE IF NOT EXISTS entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    end_user_id UUID REFERENCES end_users(id) ON DELETE SET NULL,
    
    -- Entity identification
    name VARCHAR(500) NOT NULL,
    entity_type VARCHAR(50) NOT NULL, -- person, organization, concept, place, thing
    summary TEXT,
    embedding VECTOR(1536),
    aliases JSONB DEFAULT '[]'::jsonb,
    
    -- Coactivation
    mention_count INTEGER DEFAULT 0,
    first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_entities_owner ON entities(owner_id);
CREATE INDEX idx_entities_name ON entities(owner_id, name);
CREATE INDEX idx_entities_type ON entities(entity_type);
CREATE INDEX idx_entities_embedding ON entities USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 2. ENTITY_SOURCES TABLE (N:N linking)
CREATE TABLE IF NOT EXISTS entity_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(entity_id, source_id)
);

CREATE INDEX idx_entity_sources_entity ON entity_sources(entity_id);
CREATE INDEX idx_entity_sources_source ON entity_sources(source_id);

-- 3. COMMUNITIES TABLE (clusters of entities)
CREATE TABLE IF NOT EXISTS communities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    name VARCHAR(255) NOT NULL,
    summary TEXT,
    embedding VECTOR(1536),
    entity_ids JSONB DEFAULT '[]'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_communities_owner ON communities(owner_id);
CREATE INDEX idx_communities_embedding ON communities USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 4. FACTS TABLE (Temporal Knowledge with Subject-Predicate-Object)
CREATE TABLE IF NOT EXISTS facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    end_user_id UUID REFERENCES end_users(id) ON DELETE SET NULL,
    
    -- Triple (Subject-Predicate-Object)
    subject_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    predicate VARCHAR(255) NOT NULL,
    object_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
    object_value TEXT, -- For non-entity objects like "Python" or "42"
    
    -- Human-readable
    fact_text TEXT NOT NULL,
    embedding VECTOR(1536),
    
    -- BI-TEMPORAL (KEY INNOVATION)
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
    valid_to TIMESTAMP WITH TIME ZONE, -- NULL = still current
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    invalidated_at TIMESTAMP WITH TIME ZONE,
    
    -- Confidence and Source
    confidence FLOAT DEFAULT 1.0,
    source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
    
    -- Status
    is_valid BOOLEAN DEFAULT TRUE,
    invalidation_reason VARCHAR(100) -- superseded, contradicted, expired, manual
);

CREATE INDEX idx_facts_owner ON facts(owner_id);
CREATE INDEX idx_facts_subject ON facts(subject_entity_id);
CREATE INDEX idx_facts_object ON facts(object_entity_id);
CREATE INDEX idx_facts_predicate ON facts(predicate);
CREATE INDEX idx_facts_valid ON facts(valid_from, valid_to);
CREATE INDEX idx_facts_is_valid ON facts(is_valid);
CREATE INDEX idx_facts_embedding ON facts USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 5. MEMORY_ENTITIES TABLE (N:N linking)
CREATE TABLE IF NOT EXISTS memory_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(memory_id, entity_id)
);

CREATE INDEX idx_memory_entities_memory ON memory_entities(memory_id);
CREATE INDEX idx_memory_entities_entity ON memory_entities(entity_id);

-- 6. MEMORY_FACTS TABLE (N:N linking)
CREATE TABLE IF NOT EXISTS memory_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    fact_id UUID NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(memory_id, fact_id)
);

CREATE INDEX idx_memory_facts_memory ON memory_facts(memory_id);
CREATE INDEX idx_memory_facts_fact ON memory_facts(fact_id);

-- 7. ENTITY_LINKS TABLE (Entity Graph)
CREATE TABLE IF NOT EXISTS entity_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    src_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    dst_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    
    relationship_type VARCHAR(50) NOT NULL, -- knows, related_to, part_of, owns
    weight FLOAT DEFAULT 0.5,
    fact_count INTEGER DEFAULT 0, -- How many facts connect them
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(src_entity_id, dst_entity_id)
);

CREATE INDEX idx_entity_links_src ON entity_links(src_entity_id);
CREATE INDEX idx_entity_links_dst ON entity_links(dst_entity_id);
CREATE INDEX idx_entity_links_relationship ON entity_links(relationship_type);
