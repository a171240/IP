/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const ts = require("typescript")
const { Pool } = require("pg")

const root = process.cwd()
const databaseUrl = String(process.env.APP_ACCESS_CONTROL_TEST_DATABASE_URL || "").trim()
const repositoryPath = path.join(
  root,
  "lib",
  "aliyun-rds",
  "repositories",
  "app-access-control.server.ts",
)

function compileTsModule(filePath, stubs) {
  const source = fs.readFileSync(filePath, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  }).outputText

  const compiledModule = new Module(filePath, module)
  compiledModule.filename = filePath
  compiledModule.paths = Module._nodeModulePaths(path.dirname(filePath))
  compiledModule.require = (moduleId) => {
    if (moduleId in stubs) return stubs[moduleId]
    return require(moduleId)
  }
  compiledModule._compile(compiled, filePath)
  return compiledModule.exports
}

test(
  "canonical identity, two-use trial, access grant and idempotency hold in isolated PostgreSQL",
  { skip: !databaseUrl },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl })
    const repository = compileTsModule(repositoryPath, {
      "server-only": {},
      "@/lib/aliyun-rds/postgres.server": {
        queryAliyunRds: (sql, values) => pool.query(sql, values),
        withAliyunRdsTransaction: async (operation) => {
          const client = await pool.connect()
          try {
            await client.query("begin")
            const result = await operation(client)
            await client.query("commit")
            return result
          } catch (error) {
            await client.query("rollback")
            throw error
          } finally {
            client.release()
          }
        },
      },
    })
    const voiceRepository = compileTsModule(
      path.join(
        root,
        "lib",
        "aliyun-rds",
        "repositories",
        "app-voice-coach-rds.server.ts",
      ),
      {
        "server-only": {},
        "@/lib/aliyun-rds/postgres.server": {
          getAliyunRdsPool: async () => pool,
          withAliyunRdsTransaction: async (operation) => {
            const client = await pool.connect()
            try {
              await client.query("begin")
              const result = await operation(client)
              await client.query("commit")
              return result
            } catch (error) {
              await client.query("rollback")
              throw error
            } finally {
              client.release()
            }
          },
        },
        "@/lib/aliyun-rds/repositories/app-access-control.server": repository,
      },
    )
    const authorization = compileTsModule(
      path.join(root, "lib", "aliyun-rds", "app-authorization.server.ts"),
      { "server-only": {} },
    )
    const profileRepository = compileTsModule(
      path.join(
        root,
        "lib",
        "aliyun-rds",
        "repositories",
        "account-profile.server.ts",
      ),
      {
        "server-only": {},
        "@/lib/aliyun-rds/app-authorization.server": authorization,
        "@/lib/aliyun-rds/repositories/app-access-control.server": repository,
        "@/lib/aliyun-rds/postgres.server": {
          queryAliyunRds: (sql, values) => pool.query(sql, values),
          withAliyunRdsTransaction: async (operation) => {
            const client = await pool.connect()
            try {
              await client.query("begin")
              const result = await operation(client)
              await client.query("commit")
              return result
            } catch (error) {
              await client.query("rollback")
              throw error
            } finally {
              client.release()
            }
          },
        },
        "@/lib/pricing/rules": {
          normalizePlan(value) {
            return ["free", "basic", "pro", "vip"].includes(value) ? value : "free"
          },
        },
      },
    )

    const userA = "10000000-0000-4000-8000-000000000001"
    const userB = "10000000-0000-4000-8000-000000000002"
    const operator = "10000000-0000-4000-8000-000000000003"
    const userC = "10000000-0000-4000-8000-000000000004"
    const userD = "10000000-0000-4000-8000-000000000005"
    const companyId = "20000000-0000-4000-8000-000000000001"
    const storeId = "30000000-0000-4000-8000-000000000001"
    const storeBId = "30000000-0000-4000-8000-000000000002"
    const storeCId = "30000000-0000-4000-8000-000000000003"
    const storeDId = "30000000-0000-4000-8000-000000000004"

    try {
      await pool.query("truncate public.voice_coach_turns, public.voice_coach_sessions, public.app_authorization_audit_events, public.app_idempotency_records, public.mp_account_memberships, public.entitlements, public.app_personal_trials, public.app_verified_contacts, public.app_auth_identities, public.app_canonical_users, public.mp_stores, public.mp_companies, public.profiles, auth.users restart identity cascade")
      await pool.query(
        "insert into auth.users (id, email) values ($1, 'a@test.invalid'), ($2, 'b@test.invalid'), ($3, 'operator@test.invalid'), ($4, 'c@test.invalid'), ($5, 'd@test.invalid')",
        [userA, userB, operator, userC, userD],
      )
      await pool.query(
        "insert into public.profiles (id, email) values ($1, 'a@test.invalid'), ($2, 'b@test.invalid'), ($3, 'operator@test.invalid'), ($4, 'c@test.invalid'), ($5, 'd@test.invalid')",
        [userA, userB, operator, userC, userD],
      )
      await pool.query(
        "insert into public.mp_companies (id, name) values ($1, '测试公司')",
        [companyId],
      )
      await pool.query(
        `
          insert into public.mp_stores (id, company_id, name)
          values
            ($1, $5, '测试门店 A'),
            ($2, $5, '测试门店 B'),
            ($3, $5, '测试门店 C'),
            ($4, $5, '测试门店 D')
        `,
        [storeId, storeBId, storeCId, storeDId, companyId],
      )

      const [first, second] = await Promise.all([
        repository.ensureAppCanonicalIdentityAndTrial({
          id: userA,
          app_metadata: {
            auth_source: "wechat_open_app",
            wechat_open_app_id: "wx-open-app-test",
            wechat_app_openid: "openid-a",
            wechat_unionid: "union-shared",
            wechat_union_issuer: "open-platform-test",
          },
        }),
        repository.ensureAppCanonicalIdentityAndTrial({
          id: userB,
          app_metadata: {
            auth_source: "wechat_open_app",
            wechat_open_app_id: "wx-open-app-test",
            wechat_app_openid: "openid-b",
            wechat_unionid: "union-shared",
            wechat_union_issuer: "open-platform-test",
          },
        }),
      ])

      assert.equal(first.canonicalUserId, second.canonicalUserId)
      assert.equal(first.trial.sessionLimit, 2)
      assert.equal(first.trial.sessionsUsed, 0)
      assert.equal(first.trial.sessionsRemaining, 2)

      const forgedUserMetadataIdentity =
        await repository.ensureAppCanonicalIdentityAndTrial({
          id: userC,
          user_metadata: {
            auth_source: "wechat_open_app",
            wechat_open_app_id: "wx-open-app-test",
            wechat_app_openid: "openid-forged",
            wechat_unionid: "union-shared",
            wechat_union_issuer: "open-platform-test",
          },
        })
      assert.notEqual(
        forgedUserMetadataIdentity.canonicalUserId,
        first.canonicalUserId,
      )

      const conflictingIdentity = await repository.ensureAppCanonicalIdentityAndTrial({
        id: userD,
        user_metadata: {},
      })
      await assert.rejects(
        repository.ensureAppCanonicalIdentityAndTrial({
          id: userD,
          app_metadata: {
            auth_source: "wechat_open_app",
            wechat_open_app_id: "wx-open-app-test",
            wechat_app_openid: "openid-d",
            wechat_unionid: "union-shared",
            wechat_union_issuer: "open-platform-test",
          },
        }),
        /app_identity_review_required/,
      )
      const identityReview = await pool.query(
        `
          select status, reason
          from public.app_identity_reviews
          where app_user_id = $1
        `,
        [userD],
      )
      assert.deepEqual(identityReview.rows, [{
        reason: "trusted_identity_conflict",
        status: "pending",
      }])
      const conflictMembership = await pool.query(
        `
          insert into public.mp_account_memberships (
            user_id,
            canonical_user_id,
            company_id,
            store_id,
            role,
            status,
            access_source,
            authorization_version
          )
          values ($1, $2, $3, $4, 'employee', 'active', 'test_fixture', 1)
          returning id
        `,
        [userD, conflictingIdentity.canonicalUserId, companyId, storeId],
      )
      await pool.query(
        `
          insert into public.app_membership_entitlements (
            membership_id,
            canonical_user_id,
            plan,
            status,
            feature_keys,
            authorization_version,
            grant_source
          )
          values ($1, $2, 'pro', 'active', array['voice_coach'], 1, 'test_fixture')
        `,
        [conflictMembership.rows[0].id, conflictingIdentity.canonicalUserId],
      )
      const reviewedProfile =
        await profileRepository.getAliyunRdsAppProfileContractResponse({
          id: userD,
          email: "d@test.invalid",
          app_metadata: {
            auth_source: "wechat_open_app",
            wechat_open_app_id: "wx-open-app-test",
            wechat_app_openid: "openid-d",
            wechat_unionid: "union-shared",
            wechat_union_issuer: "open-platform-test",
          },
        })
      assert.equal(reviewedProfile.identity_state, "review_required")
      assert.equal(reviewedProfile.access_mode, "personal_trial")
      assert.equal(reviewedProfile.account_status, "not_bound")
      assert.equal(reviewedProfile.active_membership_id, null)
      assert.deepEqual(reviewedProfile.memberships, [])
      assert.deepEqual(reviewedProfile.features.voice_coach, {
        enabled: false,
        reason: "not_bound",
        source: "account",
      })
      await assert.rejects(
        profileRepository.getAliyunRdsAppAccountContext({
          id: userD,
          email: "d@test.invalid",
          app_metadata: {
            auth_source: "wechat_open_app",
            wechat_open_app_id: "wx-open-app-test",
            wechat_app_openid: "openid-d",
            wechat_unionid: "union-shared",
            wechat_union_issuer: "open-platform-test",
          },
        }),
        /app_identity_review_required/,
      )
      const previousPlatformAdminIds =
        process.env.MP_PLATFORM_ADMIN_USER_IDS
      process.env.MP_PLATFORM_ADMIN_USER_IDS = userD
      try {
        const reviewedPlatformProfile =
          await profileRepository.getAliyunRdsAppProfileContractResponse({
            id: userD,
            email: "d@test.invalid",
            app_metadata: {
              auth_source: "wechat_open_app",
              wechat_open_app_id: "wx-open-app-test",
              wechat_app_openid: "openid-d",
              wechat_unionid: "union-shared",
              wechat_union_issuer: "open-platform-test",
            },
          })
        assert.equal(reviewedPlatformProfile.identity_state, "review_required")
        assert.equal(reviewedPlatformProfile.account_status, "not_bound")
        assert.equal(reviewedPlatformProfile.profile.account_role, null)
        assert.deepEqual(reviewedPlatformProfile.memberships, [])
        assert.deepEqual(reviewedPlatformProfile.features.platform_admin, {
          enabled: false,
          reason: "not_bound",
          source: "account",
        })
        await assert.rejects(
          profileRepository.getAliyunRdsAppAccountContext({
            id: userD,
            email: "d@test.invalid",
            app_metadata: {
              auth_source: "wechat_open_app",
              wechat_open_app_id: "wx-open-app-test",
              wechat_app_openid: "openid-d",
              wechat_unionid: "union-shared",
              wechat_union_issuer: "open-platform-test",
            },
          }),
          /app_identity_review_required/,
        )
      } finally {
        if (previousPlatformAdminIds === undefined) {
          delete process.env.MP_PLATFORM_ADMIN_USER_IDS
        } else {
          process.env.MP_PLATFORM_ADMIN_USER_IDS = previousPlatformAdminIds
        }
      }
      await assert.rejects(
        repository.getAppAccessSnapshot({
          id: userD,
          app_metadata: {
            auth_source: "wechat_open_app",
            wechat_open_app_id: "wx-open-app-test",
            wechat_app_openid: "openid-d",
            wechat_unionid: "union-shared",
            wechat_union_issuer: "open-platform-test",
          },
        }),
        /app_identity_review_required/,
      )
      await pool.query(
        `
          insert into public.app_verified_contacts (
            canonical_user_id,
            contact_type,
            normalized_value_hash,
            encrypted_value,
            verified_at,
            verification_source
          )
          values (
            $1,
            'phone',
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            'fixture-encrypted-phone-a',
            now(),
            'test_fixture'
          )
        `,
        [first.canonicalUserId],
      )
      await pool.query(
        `
          insert into public.app_verified_contacts (
            canonical_user_id,
            contact_type,
            normalized_value_hash,
            encrypted_value,
            verified_at,
            verification_source
          )
          values (
            $1,
            'phone',
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            'fixture-encrypted-phone-b',
            now(),
            'test_fixture'
          )
        `,
        [conflictingIdentity.canonicalUserId],
      )
      const phoneConflict = await pool.query(
        `
          select status
          from public.app_verified_contacts
          where normalized_value_hash =
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
          order by canonical_user_id
        `,
      )
      assert.deepEqual(phoneConflict.rows, [
        { status: "conflict" },
        { status: "conflict" },
      ])
      const phoneConflictAudit = await pool.query(
        `
          select count(*)::integer as count
          from public.app_authorization_audit_events
          where action = 'verified_phone.ambiguous'
        `,
      )
      assert.equal(phoneConflictAudit.rows[0].count, 2)

      const phoneClientA = await pool.connect()
      const phoneClientB = await pool.connect()
      try {
        await phoneClientA.query("begin")
        await phoneClientB.query("begin")
        await phoneClientA.query(
          `
            insert into public.app_verified_contacts (
              canonical_user_id,
              contact_type,
              normalized_value_hash,
              encrypted_value,
              verified_at,
              verification_source
            )
            values ($1, 'phone', $2, 'fixture-concurrent-a', now(), 'test_fixture')
          `,
          [
            first.canonicalUserId,
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          ],
        )
        const concurrentInsert = phoneClientB.query(
          `
            insert into public.app_verified_contacts (
              canonical_user_id,
              contact_type,
              normalized_value_hash,
              encrypted_value,
              verified_at,
              verification_source
            )
            values ($1, 'phone', $2, 'fixture-concurrent-b', now(), 'test_fixture')
          `,
          [
            forgedUserMetadataIdentity.canonicalUserId,
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          ],
        )
        await phoneClientA.query("commit")
        await concurrentInsert
        await phoneClientB.query("commit")
      } catch (error) {
        await Promise.allSettled([
          phoneClientA.query("rollback"),
          phoneClientB.query("rollback"),
        ])
        throw error
      } finally {
        phoneClientA.release()
        phoneClientB.release()
      }
      const concurrentPhoneConflict = await pool.query(
        `
          select status
          from public.app_verified_contacts
          where normalized_value_hash =
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
          order by canonical_user_id
        `,
      )
      assert.deepEqual(concurrentPhoneConflict.rows, [
        { status: "conflict" },
        { status: "conflict" },
      ])
      const allPhoneConflictAudits = await pool.query(
        `
          select count(*)::integer as count
          from public.app_authorization_audit_events
          where action = 'verified_phone.ambiguous'
        `,
      )
      assert.equal(allPhoneConflictAudits.rows[0].count, 4)

      const mismatchedMembership = await pool.query(
        `
          insert into public.mp_account_memberships (
            user_id,
            canonical_user_id,
            company_id,
            store_id,
            role,
            status,
            access_source,
            authorization_version
          )
          values ($1, $2, $3, $4, 'employee', 'active', 'test_fixture', 1)
          returning id
        `,
        [userA, conflictingIdentity.canonicalUserId, companyId, storeBId],
      )
      await pool.query(
        `
          insert into public.app_membership_entitlements (
            membership_id,
            canonical_user_id,
            plan,
            status,
            feature_keys,
            authorization_version,
            grant_source
          )
          values ($1, $2, 'pro', 'active', array['voice_coach'], 1, 'test_fixture')
        `,
        [mismatchedMembership.rows[0].id, conflictingIdentity.canonicalUserId],
      )
      const mismatchedProfile =
        await profileRepository.getAliyunRdsAppProfileContractResponse({
          id: userA,
          email: "a@test.invalid",
          app_metadata: {
            auth_source: "wechat_open_app",
            wechat_open_app_id: "wx-open-app-test",
            wechat_app_openid: "openid-a",
            wechat_unionid: "union-shared",
            wechat_union_issuer: "open-platform-test",
          },
        })
      assert.equal(mismatchedProfile.identity_state, "resolved")
      assert.equal(mismatchedProfile.account_status, "not_bound")
      assert.equal(mismatchedProfile.active_membership_id, null)
      assert.deepEqual(mismatchedProfile.memberships, [])
      await pool.query(
        "delete from public.app_membership_entitlements where membership_id = $1",
        [mismatchedMembership.rows[0].id],
      )
      await pool.query(
        "delete from public.mp_account_memberships where id = $1",
        [mismatchedMembership.rows[0].id],
      )

      const reservationInputs = [
        "app-start-00000001",
        "app-start-00000002",
        "app-start-00000003",
      ].map((clientSessionId) => ({
        canonicalUserId: first.canonicalUserId,
        clientSessionId,
        requestPayload: { scenario_id: "objection_safety" },
        userId: userA,
      }))
      const reservationResults = await Promise.allSettled(
        reservationInputs.map((input) =>
          repository.reservePersonalTrialVoiceSession(input),
        ),
      )
      const fulfilledReservations = reservationResults.filter(
        (result) => result.status === "fulfilled",
      )
      const rejectedReservations = reservationResults.filter(
        (result) => result.status === "rejected",
      )
      assert.equal(fulfilledReservations.length, 2)
      assert.equal(rejectedReservations.length, 1)
      assert.match(String(rejectedReservations[0].reason), /personal_trial_exhausted/)
      const firstFulfilledIndex = reservationResults.findIndex(
        (result) => result.status === "fulfilled",
      )
      const firstReservation = fulfilledReservations[0].value
      const firstReservationRetry =
        await repository.reservePersonalTrialVoiceSession(
          reservationInputs[firstFulfilledIndex],
        )
      assert.equal(firstReservation.deduped, false)
      assert.equal(firstReservationRetry.deduped, true)
      assert.equal(firstReservation.sessionId, firstReservationRetry.sessionId)
      assert.equal(firstReservationRetry.trial.sessionsUsed, 0)
      assert.equal(firstReservationRetry.trial.sessionsReserved, 2)
      assert.equal(firstReservationRetry.trial.sessionsRemaining, 0)

      await assert.rejects(
        repository.reservePersonalTrialVoiceSession({
          ...reservationInputs[firstFulfilledIndex],
          requestPayload: { scenario_id: "different" },
        }),
        /app_idempotency_conflict/,
      )

      const completionEvidence = {
        asrResultId: "asr-result-0001",
        nextTurnTtsAudioId: "tts-next-0001",
        openingTtsAudioId: "tts-opening-0001",
        recordingReceiptId: "recording-receipt-0001",
      }
      const completionInput = {
        canonicalUserId: first.canonicalUserId,
        completionEventId: "round-1-completed-event-0001",
        sessionId: firstReservation.sessionId,
      }
      await assert.rejects(
        repository.completePersonalTrialFirstRound({
          ...completionInput,
          evidence: completionEvidence,
        }),
        /personal_trial_first_round_evidence_incomplete/,
      )
      const trialBeforeEvidence = await pool.query(
        `
          select sessions_used
          from public.app_personal_trials
          where canonical_user_id = $1
        `,
        [first.canonicalUserId],
      )
      assert.deepEqual(trialBeforeEvidence.rows, [{ sessions_used: 0 }])

      for (const [evidenceStage, evidenceId] of [
        ["opening_tts_ready", completionEvidence.openingTtsAudioId],
        ["recording_received", completionEvidence.recordingReceiptId],
        ["asr_succeeded", completionEvidence.asrResultId],
      ]) {
        await repository.recordPersonalTrialVoiceEvidence({
          canonicalUserId: first.canonicalUserId,
          evidenceId,
          evidenceStage,
          sessionId: firstReservation.sessionId,
        })
      }
      await assert.rejects(
        repository.completePersonalTrialFirstRound(completionInput),
        /personal_trial_first_round_evidence_incomplete/,
      )
      const finalEvidence = await repository.recordPersonalTrialVoiceEvidence({
        canonicalUserId: first.canonicalUserId,
        evidenceId: completionEvidence.nextTurnTtsAudioId,
        evidenceStage: "next_turn_tts_ready",
        sessionId: firstReservation.sessionId,
      })
      const finalEvidenceReplay =
        await repository.recordPersonalTrialVoiceEvidence({
          canonicalUserId: first.canonicalUserId,
          evidenceId: completionEvidence.nextTurnTtsAudioId,
          evidenceStage: "next_turn_tts_ready",
          sessionId: firstReservation.sessionId,
        })
      assert.equal(finalEvidence.deduped, false)
      assert.equal(finalEvidenceReplay.deduped, true)
      await assert.rejects(
        repository.recordPersonalTrialVoiceEvidence({
          canonicalUserId: first.canonicalUserId,
          evidenceId: "tts-next-conflict",
          evidenceStage: "next_turn_tts_ready",
          sessionId: firstReservation.sessionId,
        }),
        /personal_trial_voice_evidence_conflict/,
      )
      const completed =
        await repository.completePersonalTrialFirstRound(completionInput)
      assert.equal(completed.deduped, false)
      assert.equal(completed.trial.sessionsUsed, 1)
      assert.equal(completed.trial.sessionsReserved, 1)
      assert.equal(completed.trial.sessionsRemaining, 0)
      const completionReplay =
        await repository.completePersonalTrialFirstRound(completionInput)
      assert.equal(completionReplay.deduped, true)
      assert.equal(completionReplay.trial.sessionsUsed, 1)
      const otherReservation = fulfilledReservations.find(
        (reservation) => reservation.value.sessionId !== firstReservation.sessionId,
      ).value
      await assert.rejects(
        repository.completePersonalTrialFirstRound({
          ...completionInput,
          completionEventId: "round-1-completed-event-conflict",
        }),
        /personal_trial_completion_conflict/,
      )
      await assert.rejects(
        repository.completePersonalTrialFirstRound({
          ...completionInput,
          sessionId: otherReservation.sessionId,
        }),
        /personal_trial_completion_conflict/,
      )

      const consumedFailure =
        await repository.releasePersonalTrialVoiceSession({
          canonicalUserId: first.canonicalUserId,
          reason: "opening_tts_failed",
          sessionId: firstReservation.sessionId,
        })
      assert.equal(consumedFailure.released, false)
      assert.equal(consumedFailure.reservationStatus, "consumed")
      assert.equal(consumedFailure.trial.sessionsUsed, 1)

      const releaseReasons = [
        "opening_tts_failed",
        "recording_receive_failed",
        "asr_failed",
        "next_turn_tts_failed",
      ]
      let firstReleasedReservation = null
      for (const [index, reason] of releaseReasons.entries()) {
        const reservation = index === 0
          ? otherReservation
          : await repository.reservePersonalTrialVoiceSession({
              canonicalUserId: first.canonicalUserId,
              clientSessionId: `release-case-${index + 1}-00000001`,
              requestPayload: { scenario_id: "objection_safety" },
              userId: userA,
            })
        if (!firstReleasedReservation) firstReleasedReservation = reservation
        const released =
          await repository.releasePersonalTrialVoiceSession({
            canonicalUserId: first.canonicalUserId,
            reason,
            sessionId: reservation.sessionId,
          })
        assert.equal(released.released, true)
        assert.equal(released.reservationStatus, "released")
        assert.equal(released.trial.sessionsUsed, 1)
      }
      const releaseReplay =
        await repository.releasePersonalTrialVoiceSession({
          canonicalUserId: first.canonicalUserId,
          reason: releaseReasons[0],
          sessionId: firstReleasedReservation.sessionId,
        })
      assert.equal(releaseReplay.deduped, true)
      assert.equal(releaseReplay.trial.sessionsUsed, 1)
      assert.equal(releaseReplay.trial.sessionsReserved, 0)
      assert.equal(releaseReplay.trial.sessionsRemaining, 1)
      const releasedSession = await pool.query(
        `
          select client_session_id
          from public.voice_coach_sessions
          where id = $1
        `,
        [firstReleasedReservation.sessionId],
      )
      const releasedClientSessionId =
        releasedSession.rows[0].client_session_id
      await assert.rejects(
        repository.reservePersonalTrialVoiceSession({
          canonicalUserId: first.canonicalUserId,
          clientSessionId: releasedClientSessionId,
          requestPayload: { scenario_id: "objection_safety" },
          userId: userA,
        }),
        /personal_trial_session_terminal/,
      )
      await assert.rejects(
        voiceRepository.createAliyunRdsPersonalTrialVoiceCoachTextSession({
          canonicalUserId: first.canonicalUserId,
          clientSessionId: releasedClientSessionId,
          firstCustomerText: "释放后的旧会话不能重新进入。",
          scenario: { id: "objection_safety" },
          userId: userA,
        }),
        /personal_trial_session_terminal/,
      )
      const releasedDetail =
        await voiceRepository.getAliyunRdsVoiceCoachTextSession({
          canonicalUserId: first.canonicalUserId,
          dataDomain: "personal_trial",
          sessionId: firstReleasedReservation.sessionId,
          userId: userA,
        })
      assert.equal(releasedDetail, null)

      const legacyMembership = await pool.query(
        `
          insert into public.mp_account_memberships (
            user_id,
            company_id,
            store_id,
            role,
            status,
            access_source,
            authorization_version
          )
          values ($1, $2, $3, 'employee', 'active', null, 0)
          returning id
        `,
        [userA, companyId, storeId],
      )

      await pool.query(`
        create or replace function public.test_force_access_grant_failure()
        returns trigger
        language plpgsql
        as $$
        begin
          if new.grant_source = 'admin_access_grant' then
            raise exception 'test_forced_access_grant_failure';
          end if;
          return new;
        end;
        $$
      `)
      await pool.query(`
        create trigger test_force_access_grant_failure
        before insert or update on public.app_membership_entitlements
        for each row execute function public.test_force_access_grant_failure()
      `)
      try {
        await assert.rejects(
          repository.grantAppAccess({
            canonicalUserId: first.canonicalUserId,
            companyId,
            featureKeys: ["voice_coach"],
            idempotencyKey: "grant-rollback-0001",
            operatorUserId: operator,
            operatorRole: "platform_admin",
            plan: "pro",
            reason: "integration rollback test",
            role: "employee",
            storeId,
          }),
          /test_forced_access_grant_failure/,
        )
      } finally {
        await pool.query(
          "drop trigger if exists test_force_access_grant_failure on public.app_membership_entitlements",
        )
        await pool.query(
          "drop function if exists public.test_force_access_grant_failure()",
        )
      }
      const rollbackEvidence = await pool.query(
        `
          select
            (select count(*)::integer from public.mp_account_memberships where canonical_user_id = $1) as membership_count,
            (select count(*)::integer from public.app_membership_entitlements where canonical_user_id = $1) as entitlement_count,
            (
              select count(*)::integer
              from public.app_authorization_audit_events
              where canonical_user_id = $1 and action = 'access_grant.upserted'
            ) as access_grant_audit_count,
            (
              select count(*)::integer
              from public.app_idempotency_records
              where actor_key = $2 and idempotency_key = 'grant-rollback-0001'
            ) as idempotency_count,
            (
              select authorization_version::integer
              from public.app_authorization_versions
              where canonical_user_id = $1
            ) as authorization_version,
            (
              select count(*)::integer
              from public.mp_account_memberships
              where id = $3 and canonical_user_id is null
            ) as legacy_membership_preserved
        `,
        [first.canonicalUserId, operator, legacyMembership.rows[0].id],
      )
      assert.deepEqual(rollbackEvidence.rows, [{
        membership_count: 0,
        entitlement_count: 0,
        access_grant_audit_count: 0,
        idempotency_count: 0,
        authorization_version: 0,
        legacy_membership_preserved: 1,
      }])

      await assert.rejects(
        repository.grantAppAccess({
          canonicalUserId: first.canonicalUserId,
          companyId,
          featureKeys: ["voice_coach"],
          idempotencyKey: "grant-free-ai-denied",
          operatorUserId: operator,
          operatorRole: "platform_admin",
          plan: "free",
          reason: "plan feature matrix test",
          role: "employee",
          storeId,
        }),
        /access_grant_feature_plan_denied/,
      )
      const secondaryIdentityLegacyMembership = await pool.query(
        `
          insert into public.mp_account_memberships (
            user_id,
            company_id,
            store_id,
            role,
            status
          )
          values ($1, $2, $3, 'employee', 'active')
          returning id
        `,
        [userB, companyId, storeCId],
      )
      const secondaryIdentityGrant = await repository.grantAppAccess({
        canonicalUserId: first.canonicalUserId,
        companyId,
        featureKeys: ["voice_coach"],
        idempotencyKey: "grant-secondary-identity-legacy",
        operatorUserId: operator,
        operatorRole: "platform_admin",
        plan: "pro",
        reason: "adopt membership from another linked identity",
        role: "employee",
        storeId: storeCId,
      })
      assert.equal(
        secondaryIdentityGrant.membershipId,
        secondaryIdentityLegacyMembership.rows[0].id,
      )
      const secondaryIdentityMembership = await pool.query(
        `
          select canonical_user_id, user_id
          from public.mp_account_memberships
          where id = $1
        `,
        [secondaryIdentityGrant.membershipId],
      )
      assert.deepEqual(secondaryIdentityMembership.rows, [{
        canonical_user_id: first.canonicalUserId,
        user_id: userB,
      }])
      await pool.query(
        "delete from public.app_membership_entitlements where membership_id = $1",
        [secondaryIdentityGrant.membershipId],
      )
      await pool.query(
        "delete from public.mp_account_memberships where id = $1",
        [secondaryIdentityGrant.membershipId],
      )

      await pool.query(
        `
          insert into public.mp_account_memberships (
            user_id,
            canonical_user_id,
            company_id,
            store_id,
            role,
            status
          )
          values ($1, $2, $3, $4, 'employee', 'active')
        `,
        [
          userA,
          forgedUserMetadataIdentity.canonicalUserId,
          companyId,
          storeDId,
        ],
      )
      const versionBeforeForeignMembershipConflict = await pool.query(
        `
          select authorization_version::integer
          from public.app_authorization_versions
          where canonical_user_id = $1
        `,
        [first.canonicalUserId],
      )
      await assert.rejects(
        repository.grantAppAccess({
          canonicalUserId: first.canonicalUserId,
          companyId,
          featureKeys: ["voice_coach"],
          idempotencyKey: "grant-foreign-canonical-conflict",
          operatorUserId: operator,
          operatorRole: "platform_admin",
          plan: "pro",
          reason: "foreign canonical membership conflict",
          role: "employee",
          storeId: storeDId,
        }),
        /membership_conflict/,
      )
      const versionAfterForeignMembershipConflict = await pool.query(
        `
          select authorization_version::integer
          from public.app_authorization_versions
          where canonical_user_id = $1
        `,
        [first.canonicalUserId],
      )
      assert.deepEqual(
        versionAfterForeignMembershipConflict.rows,
        versionBeforeForeignMembershipConflict.rows,
      )
      await pool.query(
        `
          insert into public.mp_account_memberships (
            user_id,
            company_id,
            store_id,
            role,
            status
          )
          values
            ($1, $2, $3, 'employee', 'active'),
            ($1, $2, $3, 'staff', 'active')
        `,
        [userC, companyId, storeBId],
      )
      await assert.rejects(
        repository.grantAppAccess({
          canonicalUserId: forgedUserMetadataIdentity.canonicalUserId,
          companyId,
          featureKeys: ["voice_coach"],
          idempotencyKey: "grant-legacy-conflict",
          operatorUserId: operator,
          operatorRole: "platform_admin",
          plan: "pro",
          reason: "legacy membership conflict test",
          role: "employee",
          storeId: storeBId,
        }),
        /membership_conflict/,
      )
      const legacyConflictEvidence = await pool.query(
        `
          select
            (
              select count(*)::integer
              from public.mp_account_memberships
              where user_id = $1
                and company_id = $2
                and store_id = $3
                and canonical_user_id is null
            ) as legacy_count,
            (
              select authorization_version::integer
              from public.app_authorization_versions
              where canonical_user_id = $4
            ) as authorization_version
        `,
        [
          userC,
          companyId,
          storeBId,
          forgedUserMetadataIdentity.canonicalUserId,
        ],
      )
      assert.deepEqual(legacyConflictEvidence.rows, [{
        authorization_version: 0,
        legacy_count: 2,
      }])
      const grant = await repository.grantAppAccess({
        canonicalUserId: first.canonicalUserId,
        companyId,
        featureKeys: ["voice_coach", "speech_library"],
        idempotencyKey: "grant-00000001",
        operatorUserId: operator,
        operatorRole: "platform_admin",
        plan: "pro",
        reason: "open store A",
        role: "employee",
        storeId,
      })
      const grantRetry = await repository.grantAppAccess({
        canonicalUserId: first.canonicalUserId,
        companyId,
        featureKeys: ["voice_coach", "speech_library"],
        idempotencyKey: "grant-00000001",
        operatorUserId: operator,
        operatorRole: "platform_admin",
        plan: "pro",
        reason: "open store A",
        role: "employee",
        storeId,
      })
      assert.equal(grant.deduped, false)
      assert.equal(grantRetry.deduped, true)
      assert.equal(grant.membershipId, grantRetry.membershipId)
      assert.equal(grant.membershipId, legacyMembership.rows[0].id)
      assert.ok(grant.authorizationVersion >= 1)
      await assert.rejects(
        repository.grantAppAccess({
          canonicalUserId: first.canonicalUserId,
          companyId,
          featureKeys: ["store_admin"],
          idempotencyKey: "grant-privilege-escalation",
          operatorUserId: operator,
          operatorRole: "platform_admin",
          plan: "pro",
          reason: "role feature matrix test",
          role: "employee",
          storeId,
        }),
        /access_grant_feature_role_denied/,
      )

      const snapshot = await repository.getAppAccessSnapshot({
        id: userB,
        app_metadata: {
          auth_source: "wechat_open_app",
          wechat_open_app_id: "wx-open-app-test",
          wechat_app_openid: "openid-b",
          wechat_unionid: "union-shared",
          wechat_union_issuer: "open-platform-test",
        },
      })
      assert.equal(snapshot.canonicalUserId, first.canonicalUserId)
      assert.equal(snapshot.trial.sessionsUsed, 1)
      assert.equal(snapshot.trial.sessionsReserved, 0)
      assert.equal(snapshot.trial.sessionsRemaining, 1)
      assert.equal(snapshot.authorizationVersion, grant.authorizationVersion)
      const preservedTrialDomain = await pool.query(
        `
          select
            count(*)::integer as session_count,
            bool_and(
              company_id is null
              and store_id is null
              and membership_id is null
            ) as tenant_fields_are_null
          from public.voice_coach_sessions
          where canonical_user_id = $1
            and data_domain = 'personal_trial'
        `,
        [first.canonicalUserId],
      )
      assert.deepEqual(preservedTrialDomain.rows, [{
        session_count: 5,
        tenant_fields_are_null: true,
      }])
      const formalProfile = await profileRepository.getAliyunRdsAppProfileContractResponse({
        id: userB,
        email: "b@test.invalid",
        app_metadata: {
          auth_source: "wechat_open_app",
          wechat_open_app_id: "wx-open-app-test",
          wechat_app_openid: "openid-b",
          wechat_unionid: "union-shared",
          wechat_union_issuer: "open-platform-test",
        },
      })
      assert.equal(formalProfile.account_status, "bound")
      assert.equal(formalProfile.active_membership_id, grant.membershipId)
      assert.equal(formalProfile.memberships[0].user_id, userB)
      assert.equal(formalProfile.entitlements.plan, "pro")
      assert.deepEqual(formalProfile.features.voice_coach, {
        enabled: true,
        reason: "ok",
        source: "membership",
      })
      assert.deepEqual(formalProfile.features.content, {
        enabled: false,
        reason: "entitlement_denied",
        source: "membership",
      })
      const grantB = await repository.grantAppAccess({
        canonicalUserId: first.canonicalUserId,
        companyId,
        featureKeys: ["content"],
        idempotencyKey: "grant-00000002",
        operatorUserId: operator,
        operatorRole: "platform_admin",
        plan: "pro",
        reason: "open store B",
        role: "employee",
        storeId: storeBId,
      })
      await pool.query(
        "update public.profiles set company_id = $2, store_id = $3 where id = $1",
        [userB, companyId, storeBId],
      )
      const storeBProfile =
        await profileRepository.getAliyunRdsAppProfileContractResponse({
          id: userB,
          email: "b@test.invalid",
          app_metadata: {
            auth_source: "wechat_open_app",
            wechat_open_app_id: "wx-open-app-test",
            wechat_app_openid: "openid-b",
            wechat_unionid: "union-shared",
            wechat_union_issuer: "open-platform-test",
          },
        })
      assert.equal(storeBProfile.active_membership_id, grantB.membershipId)
      assert.equal(storeBProfile.features.content.enabled, true)
      assert.equal(storeBProfile.features.voice_coach.enabled, false)
      await pool.query(
        "update public.profiles set company_id = $2, store_id = $3 where id = $1",
        [userB, companyId, storeId],
      )
      const storeAProfile =
        await profileRepository.getAliyunRdsAppProfileContractResponse({
          id: userB,
          email: "b@test.invalid",
          app_metadata: {
            auth_source: "wechat_open_app",
            wechat_open_app_id: "wx-open-app-test",
            wechat_app_openid: "openid-b",
            wechat_unionid: "union-shared",
            wechat_union_issuer: "open-platform-test",
          },
        })
      assert.equal(storeAProfile.active_membership_id, grant.membershipId)
      assert.equal(storeAProfile.features.voice_coach.enabled, true)
      assert.equal(storeAProfile.features.content.enabled, false)
      await pool.query(
        "update public.mp_stores set status = 'inactive' where id = $1",
        [storeId],
      )
      const inactiveStoreAccess = await repository.getAppAccessSnapshot({
        id: userB,
        app_metadata: {
          auth_source: "wechat_open_app",
          wechat_open_app_id: "wx-open-app-test",
          wechat_app_openid: "openid-b",
          wechat_unionid: "union-shared",
          wechat_union_issuer: "open-platform-test",
        },
      })
      assert.equal(inactiveStoreAccess.accessMode, "personal_trial")
      await pool.query(
        "update public.mp_stores set status = 'active' where id = $1",
        [storeId],
      )

      const audit = await pool.query(
        "select action from public.app_authorization_audit_events order by created_at, id",
      )
      assert.deepEqual(
        audit.rows.map((row) => row.action),
        [
          "identity.review_required",
          "verified_phone.ambiguous",
          "verified_phone.ambiguous",
          "verified_phone.ambiguous",
          "verified_phone.ambiguous",
          "personal_trial.voice_session_reserved",
          "personal_trial.voice_session_reserved",
          "personal_trial.round_1_completed",
          "personal_trial.post_consumption_failure_recorded",
          "personal_trial.voice_session_released",
          "personal_trial.voice_session_reserved",
          "personal_trial.voice_session_released",
          "personal_trial.voice_session_reserved",
          "personal_trial.voice_session_released",
          "personal_trial.voice_session_reserved",
          "personal_trial.voice_session_released",
          "access_grant.rejected",
          "access_grant.upserted",
          "access_grant.rejected",
          "access_grant.rejected",
          "access_grant.upserted",
          "access_grant.rejected",
          "access_grant.upserted",
        ],
      )

      const isolatedTrial = await repository.ensureAppCanonicalIdentityAndTrial({
        id: userC,
        user_metadata: {},
      })
      const previousReservationTtl =
        process.env.PERSONAL_TRIAL_VOICE_RESERVATION_TTL_SECONDS
      process.env.PERSONAL_TRIAL_VOICE_RESERVATION_TTL_SECONDS = "30"
      try {
        const configuredTtlReservation =
          await repository.reservePersonalTrialVoiceSession({
            canonicalUserId: isolatedTrial.canonicalUserId,
            clientSessionId: "configured-ttl-reservation-0001",
            requestPayload: { scenario_id: "objection_safety" },
            userId: userC,
          })
        const configuredTtl = await pool.query(
          `
            select extract(
              epoch from trial_reservation_expires_at - trial_reserved_at
            )::integer as ttl_seconds
            from public.voice_coach_sessions
            where id = $1
          `,
          [configuredTtlReservation.sessionId],
        )
        assert.deepEqual(configuredTtl.rows, [{ ttl_seconds: 30 }])
        for (const [evidenceStage, evidenceId] of [
          ["opening_tts_ready", "expired-opening-tts-0001"],
          ["recording_received", "expired-recording-0001"],
          ["asr_succeeded", "expired-asr-0001"],
          ["next_turn_tts_ready", "expired-next-tts-0001"],
        ]) {
          await repository.recordPersonalTrialVoiceEvidence({
            canonicalUserId: isolatedTrial.canonicalUserId,
            evidenceId,
            evidenceStage,
            sessionId: configuredTtlReservation.sessionId,
          })
        }
        await pool.query(
          `
            update public.voice_coach_sessions
            set
              trial_reserved_at = now() - interval '31 seconds',
              trial_reservation_expires_at = now() - interval '1 second'
            where id = $1
          `,
          [configuredTtlReservation.sessionId],
        )
        await assert.rejects(
          repository.completePersonalTrialFirstRound({
            canonicalUserId: isolatedTrial.canonicalUserId,
            completionEventId: "expired-completion-event-0001",
            sessionId: configuredTtlReservation.sessionId,
          }),
          /personal_trial_reservation_expired/,
        )
        const trialAfterExpiredCompletion = await pool.query(
          `
            select sessions_used
            from public.app_personal_trials
            where canonical_user_id = $1
          `,
          [isolatedTrial.canonicalUserId],
        )
        assert.deepEqual(
          trialAfterExpiredCompletion.rows,
          [{ sessions_used: 0 }],
        )
        await assert.rejects(
          repository.reservePersonalTrialVoiceSession({
            canonicalUserId: isolatedTrial.canonicalUserId,
            clientSessionId: "configured-ttl-reservation-0001",
            requestPayload: { scenario_id: "objection_safety" },
            userId: userC,
          }),
          /personal_trial_reservation_expired/,
        )
        const elapsedReservationDetail =
          await voiceRepository.getAliyunRdsVoiceCoachTextSession({
            canonicalUserId: isolatedTrial.canonicalUserId,
            dataDomain: "personal_trial",
            sessionId: configuredTtlReservation.sessionId,
            userId: userC,
          })
        assert.equal(elapsedReservationDetail, null)
        const lateTechnicalFailure =
          await repository.releasePersonalTrialVoiceSession({
            canonicalUserId: isolatedTrial.canonicalUserId,
            reason: "asr_failed",
            sessionId: configuredTtlReservation.sessionId,
          })
        assert.equal(lateTechnicalFailure.released, false)
        assert.equal(
          lateTechnicalFailure.reservationStatus,
          "expired",
        )
        assert.equal(lateTechnicalFailure.trial.sessionsUsed, 0)
        assert.equal(lateTechnicalFailure.trial.sessionsReserved, 0)
        assert.equal(lateTechnicalFailure.trial.sessionsRemaining, 2)
        const lateTechnicalFailureReplay =
          await repository.releasePersonalTrialVoiceSession({
            canonicalUserId: isolatedTrial.canonicalUserId,
            reason: "asr_failed",
            sessionId: configuredTtlReservation.sessionId,
          })
        assert.equal(lateTechnicalFailureReplay.deduped, true)
        assert.equal(
          lateTechnicalFailureReplay.reservationStatus,
          "expired",
        )
        const expiredReservationState = await pool.query(
          `
            select trial_reservation_status, trial_release_reason
            from public.voice_coach_sessions
            where id = $1
          `,
          [configuredTtlReservation.sessionId],
        )
        assert.deepEqual(expiredReservationState.rows, [
          {
            trial_release_reason: "reservation_expired",
            trial_reservation_status: "expired",
          },
        ])
        const expirySweepReservation =
          await repository.reservePersonalTrialVoiceSession({
            canonicalUserId: isolatedTrial.canonicalUserId,
            clientSessionId: "expiry-sweep-reservation-0001",
            requestPayload: { scenario_id: "objection_safety" },
            userId: userC,
          })
        await pool.query(
          `
            update public.voice_coach_sessions
            set
              trial_reserved_at = now() - interval '31 seconds',
              trial_reservation_expires_at = now() - interval '1 second'
            where id = $1
          `,
          [expirySweepReservation.sessionId],
        )
        const expired =
          await repository.expirePersonalTrialVoiceReservations({
            canonicalUserId: isolatedTrial.canonicalUserId,
          })
        assert.equal(expired.expiredCount, 1)
        assert.equal(expired.trial.sessionsUsed, 0)
        assert.equal(expired.trial.sessionsReserved, 0)
        assert.equal(expired.trial.sessionsRemaining, 2)
        await assert.rejects(
          repository.reservePersonalTrialVoiceSession({
            canonicalUserId: isolatedTrial.canonicalUserId,
            clientSessionId: "configured-ttl-reservation-0001",
            requestPayload: { scenario_id: "objection_safety" },
            userId: userC,
          }),
          /personal_trial_session_terminal/,
        )
        const expiryReplay =
          await repository.expirePersonalTrialVoiceReservations({
            canonicalUserId: isolatedTrial.canonicalUserId,
          })
        assert.equal(expiryReplay.expiredCount, 0)
      } finally {
        if (previousReservationTtl === undefined) {
          delete process.env.PERSONAL_TRIAL_VOICE_RESERVATION_TTL_SECONDS
        } else {
          process.env.PERSONAL_TRIAL_VOICE_RESERVATION_TTL_SECONDS =
            previousReservationTtl
        }
      }
      const voiceCreateInput = {
        canonicalUserId: isolatedTrial.canonicalUserId,
        clientSessionId: "voice-start-0001",
        firstCustomerText: "这次先体验如何处理顾客顾虑。",
        scenario: {
          id: "objection_safety",
          name: "顾客顾虑处理",
          goal: "完成一次个人演示",
          seedTopics: ["敏感肌"],
        },
        userId: userC,
      }
      const created = await voiceRepository.createAliyunRdsPersonalTrialVoiceCoachTextSession(
        voiceCreateInput,
      )
      const retried = await voiceRepository.createAliyunRdsPersonalTrialVoiceCoachTextSession(
        voiceCreateInput,
      )
      assert.equal(created.session.id, retried.session.id)
      assert.equal(created.deduped, false)
      assert.equal(retried.deduped, true)
      const defaultTtl = await pool.query(
        `
          select extract(
            epoch from trial_reservation_expires_at - trial_reserved_at
          )::integer as ttl_seconds
          from public.voice_coach_sessions
          where id = $1
        `,
        [created.session.id],
      )
      assert.deepEqual(defaultTtl.rows, [{ ttl_seconds: 600 }])
      await pool.query("begin")
      try {
        await assert.rejects(
          pool.query(
            `
              update public.voice_coach_sessions
              set company_id = $2, store_id = $3, membership_id = $4
              where id = $1
            `,
            [created.session.id, companyId, storeId, grant.membershipId],
          ),
          /voice_coach_sessions_domain_scope_check/,
        )
      } finally {
        await pool.query("rollback")
      }
      const turns = await pool.query(
        "select role, turn_index from public.voice_coach_turns where session_id = $1 order by turn_index",
        [created.session.id],
      )
      assert.deepEqual(turns.rows, [{ role: "customer", turn_index: 0 }])
      const trialScope = {
        canonicalUserId: isolatedTrial.canonicalUserId,
        dataDomain: "personal_trial",
        userId: userC,
      }
      const detail = await voiceRepository.getAliyunRdsVoiceCoachTextSession({
        ...trialScope,
        sessionId: created.session.id,
      })
      const submitted = await voiceRepository.appendAliyunRdsVoiceCoachTextReply({
        ...trialScope,
        audioPath: "",
        audioSeconds: null,
        clientAttemptId: "voice-attempt-0001",
        nextCustomerText: "那我再问一个问题。",
        replyText: "我会先确认您的顾虑，再说明体验边界。",
        replyToTurnId: detail.turns[0].id,
        sessionId: created.session.id,
      })
      assert.equal(submitted.beauticianTurn.role, "beautician")
      const ended = await voiceRepository.endAliyunRdsVoiceCoachTextSession({
        ...trialScope,
        buildEndState: () => ({
          dimensionScores: { empathy: 88 },
          report: { status: "ready", summary: "个人试用完成" },
          totalScore: 88,
        }),
        sessionId: created.session.id,
      })
      assert.equal(ended.session.status, "ended")
      const history = await voiceRepository.listAliyunRdsVoiceCoachTextSessionHistory({
        ...trialScope,
        limit: 10,
      })
      assert.equal(history.length, 3)
      assert.equal(
        history.every((session) => session.data_domain === "personal_trial"),
        true,
      )
      const isolatedSnapshot = await repository.getAppAccessSnapshot({
        id: userC,
        user_metadata: {},
      })
      assert.equal(isolatedSnapshot.trial.sessionsUsed, 0)
      assert.equal(isolatedSnapshot.trial.sessionsReserved, 1)
    } finally {
      await pool.end()
    }
  },
)
