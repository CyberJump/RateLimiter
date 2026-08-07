-- Fixed Window Rate Limiter
-- Atomic INCR with TTL aligned to window boundaries
--
-- KEYS[1] = ratelimit:fixed:{api_key_id}:{window_number}
-- ARGV[1] = limit
-- ARGV[2] = window_secs
--
-- Returns: {allowed (0/1), remaining, ttl, current_count}

local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

local current = redis.call('INCR', key)

if current == 1 then
  redis.call('EXPIRE', key, window)
end

-- Safety: if TTL was lost (e.g. key persisted without expiry), re-set it
local ttl = redis.call('TTL', key)
if ttl == -1 then
  redis.call('EXPIRE', key, window)
  ttl = window
end

local allowed = 0
if current <= limit then
  allowed = 1
end

local remaining = limit - current
if remaining < 0 then
  remaining = 0
end

return { allowed, remaining, ttl, current }
