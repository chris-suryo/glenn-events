-- Add answer column to open_questions so users can type the actual answer
-- rather than just marking a question as answered.
-- ⚠️  PRODUCTION: apply this in the Supabase SQL editor before deploying.
ALTER TABLE open_questions ADD COLUMN IF NOT EXISTS answer text;
