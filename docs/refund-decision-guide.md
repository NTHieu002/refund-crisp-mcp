# Cách xử lý một refund ticket — quy trình & cách ra quyết định

Tài liệu này mô tả **chi tiết cách chúng ta xử lý một yêu cầu hoàn tiền (refund) của PageFly**: từ lúc khách nhắn vào Crisp đến lúc chốt số tiền hoàn, và quan trọng nhất — **mọi quyết định được đưa ra dựa trên cơ sở nào**.

Đây là tài liệu nghiệp vụ (decision guide). Phần kiến trúc/đường đi kỹ thuật (Hugo ↔ MCP ↔ Partner API ↔ Crisp) nằm ở [`refund-flow.md`](./refund-flow.md). Logic dưới đây được **mã hoá cứng trong các handler** — đây không phải gợi ý mềm, mà là luật mà server thực thi.

> Vai trò: **Hugo** (AI Agent của Crisp) là người gọi tool và nói chuyện với khách. **MCP server** này chỉ là bộ công cụ thuần — nó tra cứu, phân loại, tính toán, soạn thư và lưu state. Không có LLM riêng. Mọi "quyết định" mô tả ở đây là logic deterministic trong handler, Hugo bắt buộc tuân theo.

---

## 0. Bức tranh tổng thể — 6 bước

```
1. NHẬN DIỆN & GẮN TAG     tag_case  (ngay turn 1, khi đánh hơi thấy ý định refund)
2. THU THẬP THÔNG TIN       collect_refund_info  (lặp mỗi turn cho tới ready_to_process)
3. TRA CỨU                  check_subscription + get_billing_history
4. PHÂN LOẠI & RA QUYẾT ĐỊNH classify_refund_case  (→ TH1–TH8, % trừ, ai duyệt)
5. TÍNH TIỀN & SOẠN THƯ     calculate_refund + generate_refund_message  (qua HARD GATE)
6. LƯU STATE                save_case_state  (BẮT BUỘC — trước khi kết thúc)
```

Thứ tự gọi tool điển hình (cũng ghi trong server `instructions`):

```
get_case_state → collect_refund_info → check_subscription →
get_billing_history → classify_refund_case → calculate_refund →
generate_refund_message → save_case_state → tag_case
```

---

## 1. Nhận diện & gắn tag (turn 1)

**Quyết định:** Đây có phải refund ticket không?

Bất kỳ ý định "refund-adjacent" nào cũng kích hoạt: *refund, cancel, unsubscribe, downgrade, double charge, auto-upgrade, "hoàn tiền", "hủy gói"…*

- Gọi `tag_case` **ngay turn đầu tiên**, trước cả câu hỏi làm rõ đầu tiên — để dashboard Crisp lọc được case refund theo thời gian thực.
- `tag_case` **không nhận tham số** (`{}`): danh tính cuộc hội thoại lấy từ header Crisp đã ký (`x-crisp-session-id`, `x-crisp-website-id`), không lấy từ argument.
- Nguyên tắc: **gắn thừa thì an toàn, gắn thiếu thì không**. Idempotent — gọi nhiều lần vô hại.

Tag gây ra 2 side effect (fire-and-forget): (a) PATCH segment `refund` vào conversation, (b) POST một dòng "skeleton" vào ops sheet với `stage: "refund_detected"`. Mạng lưới an toàn thứ hai: n8n cũng có một keyword-flow tự gắn tag từ payload event, phòng khi Hugo quên gọi `tag_case`.

---

## 2. Thu thập thông tin — HARD GATE #1

**Quyết định:** Đã đủ thông tin để báo giá refund chưa?

Gọi `collect_refund_info` ở **đầu mỗi turn của khách** và đọc `next_question` đọc nguyên văn (kể cả URL ảnh hướng dẫn). Tool trả về `ready_to_process: true` **chỉ khi** đủ 4 mục VÀ không có blocker nào active.

### 4 mục bắt buộc (theo đúng thứ tự hỏi)

| Ưu tiên hỏi | Mục | Vì sao cần |
|---|---|---|
| 1 | `refund_reason` | Để phân loại đúng case và chọn giải pháp phù hợp |
| 2 | `store_url` | Khoá tra cứu subscription/billing; chuẩn hoá qua `normalizeStoreUrl` |
| 3 | `billing_invoice` | Bằng chứng khoản charge thực tế (Shopify Admin → Settings → Billing → Bills) |
| 4 | `bank_confirmation` | Nơi nhận tiền hoàn |

### Blocker — mỗi lần chỉ nêu MỘT để giữ Hugo tập trung

Logic trong `collect_refund_info/handler.ts` (xét theo thứ tự):

1. **`bill_status === "failed"`** → blocker: charge fail (store thường bị **frozen**), chưa có tiền → KHÔNG thể hoàn. Đề xuất **App Credit** để offset phần PageFly (App Credit chỉ bù PageFly, KHÔNG bù Shopify/taxes/apps khác) → khách reactivate được; hoặc đợi Shopify retry tới khi `Paid` rồi hoàn. Xem [Addendum §6](./Refund_Decision_Guide_Addendum.md).
2. **`bill_status === "upcoming"`** → blocker: bill chưa xử lý xong. Đề xuất Option A (App Credit ngay) hoặc Option B (đợi bill `Paid` rồi hoàn về bank). → đây chính là **TH4**.
3. **`bill_status === "unknown"`** → blocker: phải xác minh bill `Paid` hay `Upcoming` trước.
4. **Store vẫn ở gói trả phí** (chưa `uninstalled`, chưa `closed`, và `is_downgraded_to_free === false`) → blocker: yêu cầu khách downgrade về **Free** trước khi hoàn.

> **Tuyệt đối không** tính/báo số tiền (`calculate_refund`, `generate_refund_message`) cho tới khi `ready_to_process: true`. Đây là HARD GATE #1.

---

## 3. Tra cứu — sự thật từ hệ thống, không tin lời khai

- `check_subscription` + `get_billing_history` đọc từ **Shopify Partner API** (proxy qua n8n webhook). Khi thiếu `N8N_WEBHOOK_URL`/`N8N_API_KEY` (dev/offline) thì fallback sang `fixtures/*`. Cache TTL 60s nên cặp subscription+billing dùng chung một lần gọi.
- **Store URL luôn được chuẩn hoá trước mọi tra cứu** (`store_url.ts` / `store_resolver.ts`). Khách gửi URL admin, handle trống, hay custom domain đều xử lý được. Custom domain: best-effort fetch storefront 3s để scrape `Shopify.shop`, cache 3 ngày.
- **Miss lần đầu KHÔNG escalate cho người thật.** Trả về thông điệp hướng dẫn khách tìm URL `.myshopify.com`. Đây là thiết kế cố ý.

`get_billing_history` cũng trả về **Upcoming bill** và **earnings sau phí Shopify** — đầu vào để quyết TH4 và để tính tiền.

**`check_usage_data`** — khi khách claim "tôi chưa hề dùng app", gọi tool này với khoảng `period_start`/`period_end` = chu kỳ bị tính. Nếu `has_usage === true` (có page published/edited) → bằng chứng để **từ chối (TH8)**, dẫn chứng tên page + ngày trong `evidence_summary`. **Lưu ý:** khi `data_source === "unavailable"` (nguồn page-usage chưa wire) thì `has_usage=false` KHÔNG có nghĩa khách không dùng — quyết theo ngày chu kỳ. Xem [Addendum §3](./Refund_Decision_Guide_Addendum.md).

---

## 4. Phân loại & ra quyết định — `classify_refund_case`

Đây là **bộ não nghiệp vụ**. Đầu vào là context (`reason`, `bill_status`, `store_status`, `plan_status`, `app_status`, `num_cycles_requested`, `has_prior_commitment`, `is_angry`, cùng các cờ ở Addendum: trigger 0%/10%, cờ nhạy cảm, `used_full_cycle`/`has_recent_usage`); đầu ra là case TH1–TH8 + hành động đề xuất + % trừ + cờ escalation + `manager_reason`.

### 4.1 Chọn case — theo THỨ TỰ ƯU TIÊN (cái đầu tiên khớp thắng)

```
TH5  (auto-upgrade trái phép)  ── thắng tất cả ───────────────┐
TH4  (bill còn Upcoming)        ── bất kể state khác          │
TH7  (store closed + còn gói paid)                            │  ưu tiên
TH3  (app đã uninstalled)                                     │  giảm dần
TH2  (tưởng bị double-charge)                                 │
TH6  (hỏi cách ngừng bị charge, KHÔNG nhắc "refund")          │
TH1  (mặc định: cancel/downgrade giữa chu kỳ)  ──────────────┘
```

| Case | Nhận diện | Hành động đề xuất |
|---|---|---|
| **TH5** | reason chứa "auto-upgrade", "unauthorized", "didn't agree", "without my permission"… | **Escalate Manager (Boo) ngay.** Tính lại số tiền lẽ ra phải trả ở gói khách *định* dùng, hoàn phần chênh. |
| **TH4** | `bill_status === "upcoming"` | Hai lựa chọn: (A) App Credit ngay để bù khoản sắp tới, (B) đợi bill `Paid` rồi hoàn bank. Khách nóng giận → ưu tiên App Credit. |
| **TH7** | `store_status === "closed"` **và** `plan_status === "paid"` | **Không** bắt khách cài lại. Hoàn prorated phần chưa dùng của chu kỳ hiện tại; hoàn nhiều chu kỳ cần Manager duyệt. |
| **TH3** | `app_status === "uninstalled"` | **Không** bắt cài lại. Lấy store URL + invoice, hoàn prorated (`num_cycles = 1`), trừ 20%. |
| **TH2** | reason chứa "double charge", "charged twice", "two charges"… | **Không hoàn.** Giải thích 2 charge là 2 subscription sau khi đổi gói (công thức switch-plan), tổng đúng bằng số phải trả. |
| **TH6** | reason chứa "stop being charged/charging", "cancel billing"… **và KHÔNG** chứa "refund" | Hướng dẫn downgrade về Free. Không hoàn, trừ khi chu kỳ trả phí còn nằm trong cửa sổ chưa dùng. |
| **TH1** | Mặc định khi không khớp gì ở trên | Hoàn prorated số ngày chưa dùng của chu kỳ hiện tại (`Charge × days_unused ÷ 30`), trừ 20% trừ khi có commitment. |
| **TH8** | (lớp phủ lên TH1/TH3) `used_full_cycle` HOẶC `has_recent_usage` — VÀ khách KHÔNG nhạy cảm, KHÔNG có trigger 0% | **Từ chối lịch sự** theo Official Refund Policy (đã dùng hết chu kỳ / data chứng minh active). Chỉ hoàn nếu có charge MỚI cho chu kỳ chưa dùng. Xem [Addendum §3, §11](./Refund_Decision_Guide_Addendum.md). |

> **TH8 không bao giờ áp cho khách nhạy cảm** (loyal ≥2 năm, high-value, frustrated, bad-review risk/đã review, discount claim). Các case đó → escalate Manager, KHÔNG tự từ chối. Bài học Innergrade: 1 bad review từ khách lâu năm hại hơn nhiều giá trị 1 cycle.

### 4.2 Quyết định % trừ (`deduction_percent`) — `deriveDeduction`

Xét theo thứ tự (xem [Addendum §1–2, §9](./Refund_Decision_Guide_Addendum.md)):

```
has_prior_commitment === true                                   → 0%   (cam kết của người HOẶC bot — tôn trọng kể cả khi số cũ tính sai)
feature_issue | service_failure | is_trial_period
  | is_returning_customer                                        → 0%   (lỗi PageFly / support fail / trial / khách quay lại)
case === TH2 | TH8                                               → 0%   (không hoàn / từ chối → không có khái niệm trừ)
num_cycles_requested >= 3                                        → 40%  (hoàn ≥3 chu kỳ app không dùng → chi phí hạ tầng)
is_yearly_plan | customer_counters_deduction                     → 10%  (gói năm / khách counter 20% → chia đôi phí Shopify)
còn lại                                                          → 20%  (mặc định: 15% phí giao dịch Shopify + 5% bảo trì)
```

Diễn giải gửi khách (trong `calculate_refund`):
- **0%** — "Full refund — no deduction (commitment honored / PageFly fault / trial / returning customer)."
- **10%** — "Split Shopify processing fees equally — each side covers half." → **gửi kèm screenshot Shopify fee breakdown làm proof.**
- **20%** — "15% Shopify transaction processing fee + 5% system maintenance."
- **40%** — "Infrastructure & maintenance costs for multiple unused cycles."

> **Con số chỉ là THAM KHẢO.** `generate_refund_message` luôn đóng khung "the estimated refund would be approximately $X, subject to review"; nếu cần Manager duyệt thì nói rõ. Không bao giờ chốt cứng số trước khi verify đủ data + (nếu cần) Manager duyệt + bill đã Paid.

### 4.3 Quyết định escalation — ai được phép chốt?

```
needs_manager (Boo)   = num_cycles_requested >= 3  OR  TH5  OR  has_prior_commitment
                        OR subscription_age_years >= 2   (khách lâu năm)
                        OR is_high_value                 (gói năm / multi-store / gói đắt)
                        OR is_frustrated                 (than phiền nhiều lần)
                        OR bad_review_risk               (dấu hiệu sẽ review xấu)
                        OR already_left_bad_review       (đã để review xấu → pivot full refund)
                        OR discount_commitment_claim     (claim được hứa discount)
needs_shift_manager   = is_angry
can_self_decide       = NOT needs_manager
manager_reason        = chuỗi liệt kê lý do (đưa vào manager brief)
```

- **Manager (Boo)**: bất kỳ điều kiện nào ở trên. Output `manager_reason` giải thích vì sao.
- Các flag nhạy cảm vừa **bắt buộc Manager** vừa **chặn auto-decline (TH8)** — xem mục 4.1.
- **Shift Manager**: khách đang nóng giận (xử lý cảm xúc/độ ưu tiên, song song với chuyên môn refund).
- Còn lại Hugo tự quyết trong khuôn khổ playbook.

### 4.4 Hai cờ điều kiện tiên quyết

- `requires_downgrade = (chưa uninstalled VÀ chưa closed)` — store đang sống thì phải về Free trước khi hoàn.
- `requires_bill_paid = (case !== TH4)` — refund chỉ xử lý khi bill đã `Paid`; TH4 dùng App Credit thay thế.

---

## 5. Tính tiền & soạn thư — HARD GATE #2

### 5.1 Gate phòng thủ chiều sâu (`calculate_refund` & `generate_refund_message`)

Cả hai handler **tự kiểm tra lại** 3 cờ trước khi làm bất cứ điều gì — vì mô tả tool thường bị Hugo phớt lờ:

```
has_billing_invoice           phải true
has_bank_confirmation         phải true
verified_downgrade_complete   phải true
```

Bất kỳ cờ nào `false` → trả về **`BLOCKED`** (số tiền = 0, kèm hướng dẫn gọi `collect_refund_info`). `generate_refund_message` cũng bị chặn y hệt nên Hugo **không thể** né `calculate_refund` để tự soạn báo giá.

> `verified_downgrade_complete` phải được hậu thuẫn bằng một lần `check_subscription` mới đọc `plan === "free"` (hoặc `uninstalled`/`cancelled`). Lời nói "tôi vừa downgrade rồi" **không đủ** — gate vẫn từ chối.

### 5.2 Công thức tính (`calculate_refund/handler.ts`)

Chu kỳ luôn là **30 ngày** (`CYCLE_LENGTH_DAYS = 30`).

**Một chu kỳ (`num_cycles === 1`) — prorated theo ngày chưa dùng:**
```
days_used   = clamp(daysBetween(cycle_start, cancel_date), 0..30)
days_unused = 30 - days_used
prorated    = charge_amount × days_unused / 30
```

**Nhiều chu kỳ (`num_cycles >= 2`) — tính đủ cả chu kỳ, KHÔNG prorate:**
```
total_charge = charge_amount × cycles
prorated     = total_charge
```

**Trừ deduction (chung cho cả hai):**
```
deduction_amount = prorated × deduction% / 100
refund_amount    = prorated − deduction_amount
refund_per_cycle = refund_amount / cycles
```

Mọi số tiền làm tròn 2 chữ số; `deduction_percent` được `clamp(0..100)`. `formula_explanation` xuất chuỗi giải thích để Hugo dán thẳng cho khách.

### 5.3 Soạn thư (`generate_refund_message/handler.ts`)

Ráp các khối template theo case:
- **Intro**: khách nóng giận → mở đầu xin lỗi (`INTRO_ANGRY`); còn lại lời cảm ơn chuẩn.
- **Winback** (chỉ khi `include_winback` và case **không** phải TH2/TH5): hỏi lý do rời đi + đề nghị 1:1 support / hỗ trợ kỹ thuật / giảm 20% chu kỳ sau.
- **Khối theo case**: TH2 → giải thích switch-plan (không hoàn); TH4 → khối Option A/B; TH5 → đã báo Manager; TH6 → hướng dẫn về Free (+ breakdown nếu vẫn có hoàn); TH1/TH3/TH7 → breakdown prorated.

Đầu ra kèm 2 cờ điều hướng:
```
needs_customer_confirm = (case !== TH2) VÀ refund_amount > 0
needs_manager_approve  = (case === TH5) HOẶC cycles >= 3
```

---

## 6. Lưu state — HARD GATE #3 (BẮT BUỘC)

**Quyết định:** **Mỗi bước xử lý** đều phải `save_case_state` — không chỉ lúc kết thúc.

Hugo có xu hướng **quên** bước này — báo giá xong rồi đóng máy, làm mất cả state Turso (không resume được hôm sau) lẫn số tiền trên ops sheet. Vì thế: **làm xong action nào, lưu ngay action đó**, kèm `stage` tương ứng.

| Vừa làm xong | `stage` truyền vào | Kèm theo |
|---|---|---|
| Hỏi/nhận thêm thông tin | `collecting_info` | các cờ `has_*` đã có |
| Gửi win-back / offer | `offer_sent` | `winback_offered: true` |
| Gửi bill / breakdown refund | `bill_sent` | `breakdown_sent: true`, `refund_amount`, `deduction_percent` |
| Báo số xong, chờ khách xác nhận | `awaiting_customer_confirm` | |
| Gửi option TH4 A/B hoặc App Credit | `awaiting_option_choice` | |
| **Forward sang Manager (Boo)** | `awaiting_manager` | `needs_manager: true`, `manager_status: pending`, `manager_brief` |
| **Forward sang human agent** | `forwarded_to_human` | `assigned_agent: <tên>` |
| Khách đồng ý | `refund_approved` | |
| Đã hoàn trong Shopify | `refund_issued` → `completed` | `refund_processed_at` |
| Từ chối (TH8) | `completed` | `resolution: declined` |

- Tối thiểu luôn truyền `store_url` (khoá chính) + `stage`; thêm field nào vừa đổi.
- Nếu khách im: **lưu trước** với stage hiện tại rồi mới chờ. Khi phân vân → cứ lưu.
- `stage` giờ là **free text** (không còn enum cứng) — một stage lạ/sai chính tả **không bao giờ làm hỏng cả lần lưu** (cùng triết lý với `crisp_conversation_id`). Vẫn nên dùng các giá trị canonical ở trên để filter ops-sheet/`list_pending_cases` nhất quán.

### Vòng đời stage

```
collecting_info → (offer_sent / bill_sent) → awaiting_customer_confirm
                → refund_approved → refund_issued → completed
                ↘ winback_offered → (completed: kept)
                ↘ awaiting_manager (≥3 cycles / TH5 / case nhạy cảm) → approved → refund_issued
                ↘ forwarded_to_human (handoff cho người thật)
                ↘ completed (resolution: declined)  ← TH8
Terminal khác: awaiting_bill_paid / awaiting_option_choice (TH4), rejected, abandoned
```

State lưu ở bảng `cases` của Turso, **khoá theo `store_url`** (khách quay lại được match theo store, không theo session). `save_case_state` merge từng phần (bỏ qua field `undefined`) nên lưu được bất kỳ tập con cột nào.

### Side effect khi save (fire-and-forget, nuốt lỗi để không làm hỏng DB save)

1. PATCH segment `refund` vào conversation (auto-tag — mạng lưới an toàn nếu turn 1 quên `tag_case`).
2. POST snapshot vào ops sheet **làm giàu** dòng skeleton mà `tag_case` đã tạo (amount, resolution, notes…). n8n phải **Append-or-Update theo `Ticket ID`** (`crisp_conversation_url`), nếu không sẽ tạo dòng trùng.

---

## 7. Tóm tắt cây quyết định

```
Khách nhắn
   │
   ├─ Có ý định refund?  ──No──► xử lý như ticket thường
   │  Yes → tag_case {}  (turn 1)
   ▼
collect_refund_info  (lặp)
   ├─ thiếu mục?      → hỏi theo thứ tự reason→store→invoice→bank
   ├─ bill upcoming?  → TH4: Option A/B   (chưa hoàn)
   ├─ chưa về Free?   → yêu cầu downgrade  (chưa hoàn)
   └─ ready_to_process: true
   ▼
check_subscription + get_billing_history   (sự thật hệ thống)
   ▼
classify_refund_case
   ├─ case = priority(TH5→TH4→TH7→TH3→TH2→TH6→TH1)
   ├─ deduction = commitment?0 : TH2?0 : ≥3cy?40 : 20
   ├─ needs_manager  = ≥3cy ∨ TH5 ∨ commitment
   └─ needs_shift_mgr = is_angry
   ▼
HARD GATE: invoice ✓ + bank ✓ + downgrade-verified ✓ ?
   ├─ No  → BLOCKED  (quay lại collect_refund_info)
   └─ Yes
       ▼
   calculate_refund  (1 chu kỳ: prorated theo ngày; nhiều: full × cycles; − deduction)
   generate_refund_message  (intro + winback? + khối theo case + breakdown)
   ▼
save_case_state  (BẮT BUỘC — store_url, amount, deduction, case_type, stage)
   ▼
needs_manager_approve? → chờ Boo duyệt → refund_issued → done
```

---

## 8. Bảng tra nhanh quyết định

| Tình huống | Quyết định | Nguồn (handler) |
|---|---|---|
| Tra cứu store miss lần đầu | KHÔNG escalate; hướng dẫn tìm `.myshopify.com` | `store_resolver.ts` |
| Bill còn Upcoming | TH4 — đề nghị App Credit (A) / đợi Paid (B); không hoàn ngay | `classify` + `collect` |
| Store còn ở gói paid | Yêu cầu downgrade Free trước; gate chặn tới khi verify | `collect` + `calculate` gate |
| "Tôi vừa downgrade rồi" (chưa verify) | Vẫn BLOCKED; phải `check_subscription` đọc `free` | `calculate`/`generate` gate |
| Nghi double-charge | TH2 — không hoàn, giải thích switch-plan | `classify` |
| Auto-upgrade trái phép | TH5 — escalate Boo ngay, hoàn phần chênh | `classify` |
| Hoàn ≥ 3 chu kỳ | trừ 40% + cần Manager duyệt | `deriveDeduction` + `needs_manager` |
| Có commitment trước đó (người HOẶC bot) | trừ 0% (full refund) + cần Manager duyệt | `deriveDeduction` + `needs_manager` |
| Lỗi PageFly / support fail / trial / khách quay lại | trừ 0% (full refund) | `deriveDeduction` |
| Gói năm, hoặc khách counter mức 20% | trừ 10% (+ proof Shopify fee breakdown) | `deriveDeduction` |
| Đã dùng hết chu kỳ / data chứng minh active | **TH8 từ chối** (trừ khi khách nhạy cảm → Manager) | `applyDecline` |
| Khách lâu năm (≥2y) / high-value / sẽ-review-xấu | luôn ưu tiên + **bắt buộc Manager**, KHÔNG tự từ chối | `deriveManagerReasons` |
| Đã để bad review | escalate Manager ngay + pivot full refund để recover | `deriveManagerReasons` |
| Bill `failed` (store frozen) | không hoàn được → offer App Credit | `collect` + `generate` |
| Được hứa discount nhưng bị overcharge | refund phần chênh (`discount_adjustment`) + Manager verify proof | `calculate` + `generate` |
| Dashboard đã có refund cho charge này | `calculate_refund` từ chối — không hoàn 2 lần | `calculate` |
| Bill hiển thị EUR/CAD/INR/AED | nói rõ charge & refund đều bằng USD | `generate` (`currencyNote`) |
| Khách nóng giận | `needs_shift_manager`; intro xin lỗi; TH4 ưu tiên App Credit | `classify` + `generate` |
| Báo giá xong, khách im | `save_case_state(stage: awaiting_customer_confirm)` rồi mới chờ | HARD GATE #3 |

---

*Lưu ý bảo trì: logic trên là nguồn sự thật **trong handler**. Khi đổi hành vi tool hoặc playbook, phải cập nhật đồng bộ chuỗi `instructions` ở `src/mcp/index.ts` (thứ thực sự lái Hugo) và chạy lại **Refresh tools** trong Crisp để nạp instructions mới. Sau thay đổi liên quan, `grep save_case_state` để chắc gate #3 còn nguyên.*
