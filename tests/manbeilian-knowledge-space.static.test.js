const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const trainingSource = fs.readFileSync(path.join(root, "lib", "voice-coach", "training.server.ts"), "utf8")
const migrationSource = fs.readFileSync(
  path.join(root, "supabase", "migrations", "20260615143000_seed_manbeilian_knowledge_space.sql"),
  "utf8",
)

test("voice coach backend recognizes Manbeilian as a first-class knowledge space", () => {
  assert.match(trainingSource, /MANBEILIAN_KNOWLEDGE_SPACE_ID = "manbeilian_store_knowledge_v1"/)
  assert.match(trainingSource, /TRAINING_PACK_MODE_MANBEILIAN = "manbeilian-speaking"/)
  assert.match(trainingSource, /MANBEILIAN_PACK_ID = "manbeilian_professional_speaking_v1"/)
  assert.match(trainingSource, /display_name: "曼贝莲项目库"/)
  assert.match(trainingSource, /local_fallback: true/)
  assert.match(trainingSource, /task_count: 221/)
  assert.match(trainingSource, /value === "manbeilian_speaking"/)
  assert.match(trainingSource, /mode === TRAINING_PACK_MODE_MANBEILIAN/)
})

test("knowledge and training data reads use production mini-program tables before legacy fallbacks", () => {
  assert.match(trainingSource, /\.from\("mp_knowledge_spaces"\)/)
  assert.match(trainingSource, /\.from\("mp_knowledge_space_access"\)/)
  assert.match(trainingSource, /\.from\("voice_training_packs"\)/)
  assert.match(trainingSource, /\.from\("voice_training_tasks"\)/)
  assert.match(trainingSource, /\.from\("voice_training_progress"\)/)
  assert.match(trainingSource, /\.from\("voice_coach_knowledge_spaces"\)/)
  assert.match(trainingSource, /\.from\("voice_coach_training_packs"\)/)
  assert.match(trainingSource, /\.from\("voice_coach_training_progress"\)/)
  assert.match(trainingSource, /const legacySpaces = await listLegacyKnowledgeSpaces/)
  assert.match(trainingSource, /uniqueSpaces\(\[\.\.\.mpSpaces, \.\.\.legacySpaces, \.\.\.seedSpaces\]\)/)
  assert.doesNotMatch(trainingSource, /mpSpaces\.length \? \[\] : await listLegacyKnowledgeSpaces/)
})

test("Manbeilian seed migration grants the company members access without schema changes", () => {
  assert.match(migrationSource, /insert into public\.voice_training_packs/)
  assert.match(migrationSource, /'manbeilian_professional_speaking_v1'/)
  assert.match(migrationSource, /from public\.mp_companies/)
  assert.match(migrationSource, /where name = '曼贝莲'/)
  assert.match(migrationSource, /insert into public\.mp_knowledge_spaces/)
  assert.match(migrationSource, /insert into public\.mp_knowledge_space_access/)
  assert.match(migrationSource, /join target_company on target_company\.id = membership\.company_id/)
  assert.doesNotMatch(migrationSource, /create table/i)
  assert.doesNotMatch(migrationSource, /alter table/i)
})
