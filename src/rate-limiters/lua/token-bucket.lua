-- Token Bucket Rate Limiter
-- Hash storing {tokens, last_refill}. Refills based on elapsed time.
--
-- KEYS[1] = ratelimit:bucket:{api_key_id}
-- ARGV[1] = rate (tokens per window, i.e. the limit)
-- ARGV[2] = window_secs
-- ARGV[3] = burst_capacity (max tokens the bucket can hold)
-- ARGV[4] = now_ms (current timestamp in milliseconds, from Redis TIME)
--
-- Returns: {allowed (0/1), remaining_tokens, next_token_ms, tokens_consumed}

local key = KEYS[1]
local rate = tonumber(ARGV[1])
local window_secs = tonumber(ARGV[2])
local burst = tonumber(ARGV[3])
local now = tonumber(ARGV[4])

-- Calculate refill rate: tokens per millisecond
local refill_rate = rate / (window_secs * 1000)

local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(bucket[1])
local last_refill = tonumber(bucket[2])

if tokens == nil then
  -- First request: initialize bucket at full burst capacity
  tokens = burst
  last_refill = now
else
  -- Refill tokens based on elapsed time
  local elapsed = now - last_refill
  if elapsed > 0 then
    local refill = elapsed * refill_rate
    tokens = math.min(burst, tokens + refill)
    last_refill = now
  end
end

local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end

-- Persist updated bucket state
redis.call('HMSET', key, 'tokens', tostring(tokens), 'last_refill', tostring(last_refill))
-- TTL = 2x window for safety (cleanup idle buckets)
redis.call('PEXPIRE', key, window_secs * 2000)

local remaining = math.floor(tokens)

-- Time until next token (in ms)
local next_token_ms = 0
if tokens < 1 then
  next_token_ms = math.ceil((1 - tokens) / refill_rate)
end

local consumed = math.floor(burst - tokens)

return { allowed, remaining, next_token_ms, consumed }
