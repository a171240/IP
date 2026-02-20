# WO-R3-XXX Analysis

## Selfcheck Summary
- status: FAIL
- error_code: asr_flash_permission_denied
- appid_last4: 8764
- resource_id: volc.bigasr.auc_turbo
- flash_request_id: f693af94-7277-46c8-ab25-ed3110fba6c5
- flash_logid: 202602201909072EDB9365154704333612
- occurred_at: 2026-02-20T11:09:07.250Z
- environment: unknown

## Startup Gate Summary
- require_flash=true: FAIL (startup blocked)
- require_flash=false: N/A (startup gate skipped)

## Metrics (this round)
- selfcheck_status: FAIL
- uploaded_audio_format_distribution: {"mp3":0,"wav":0,"ogg":0,"aac":0,"unknown":0}
- flash_permission_denied_count: 2

## Notes
- `flash_permission_denied_count=2` is counted from bench logs in this work order:
  - selfcheck run (`bench_A.log`) = 1
  - startup gate require_flash=true run (`bench_B.log`) = 1
- No end-to-end audio upload bench was executed in this work order, so uploaded format distribution is set to zeros.
