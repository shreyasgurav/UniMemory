"""
SimHash for fuzzy text deduplication
"""
import hashlib
from typing import Set


def canonical_token_set(text: str) -> Set[str]:
    """Extract canonical tokens from text"""
    import re
    lowercased = text.lower()
    
    # Split on non-alphanumeric
    pattern = r"[^a-z0-9]+"
    tokens = re.split(pattern, lowercased)
    tokens = [t for t in tokens if len(t) > 2]  # Filter short tokens
    
    return set(tokens)


def compute_simhash(text: str) -> str:
    """
    Compute SimHash for text (64-bit hex string)
    Mirrors the Swift implementation
    """
    tokens = canonical_token_set(text)
    hashes = []
    
    for token in tokens:
        h = 0
        for char in token:
            # Simulate 32-bit signed int operations
            h = (h << 5) - h + ord(char)
            h = h & 0xffffffff  # Enforce 32-bit semantics
            
            # Convert to signed 32-bit
            if h & 0x80000000:
                h = -((h ^ 0xffffffff) + 1)
        
        hashes.append(h & 0xffffffff)
    
    # Create 64-dim vector (by testing 32 bits twice)
    vec = [0] * 64
    for h in hashes:
        for i in range(64):
            bit = 1 << (i % 32)  # Wrap every 32 bits
            if h & bit:
                vec[i] += 1
            else:
                vec[i] -= 1
    
    # Convert to hex string (16 hex digits = 64 bits)
    res_hash = ""
    for i in range(0, 64, 4):
        nibble = 0
        if vec[i] > 0:
            nibble += 8
        if vec[i+1] > 0:
            nibble += 4
        if vec[i+2] > 0:
            nibble += 2
        if vec[i+3] > 0:
            nibble += 1
        res_hash += format(nibble, 'x')
    
    return res_hash


def hamming_distance(h1: str, h2: str) -> int:
    """Calculate Hamming distance between two SimHashes"""
    if len(h1) != len(h2):
        return 64  # Max distance
    
    dist = 0
    for i in range(len(h1)):
        x = int(h1[i], 16) ^ int(h2[i], 16)
        # Count bits in nibble
        if x & 8:
            dist += 1
        if x & 4:
            dist += 1
        if x & 2:
            dist += 1
        if x & 1:
            dist += 1
    
    return dist


def is_similar(h1: str, h2: str, threshold: int = 3) -> bool:
    """Check if two SimHashes are similar (within threshold)"""
    return hamming_distance(h1, h2) <= threshold

