# Phần bổ sung — Refund Decision Guide (Addendum)

> ✅ **ĐÃ TRIỂN KHAI (2026-06-22).** Toàn bộ 12 mục dưới đây đã được mã hoá vào các handler và đồng bộ vào `instructions` của MCP server. Xem bảng map ở mục 12 để biết file tương ứng. Sau khi deploy, nhớ chạy lại **Refresh tools** trong Crisp để Hugo nạp instructions + tool `check_usage_data` mới.

Tài liệu này **bổ sung** cho `refund-decision-guide.md`. Nó liệt kê những business logic phát sinh từ thực tế xử lý ~70 case mà guide gốc chưa bao phủ. Mọi mục dưới đây cần được mã hoá vào handler tương ứng và đồng bộ vào `instructions` của MCP server.

> **Nguyên tắc bao trùm:** Số tiền refund mà tool tính ra là **CON SỐ THAM KHẢO**, KHÔNG phải quyết định cuối cùng. Hugo phải trình bày như đề xuất ("Based on our calculation, the estimated refund would be...") chứ không chốt cứng. Quyết định cuối thuộc về người thật / Manager, đặc biệt với case nhạy cảm.

---

## 1. Bổ sung mức deduction 10% (THIẾU trong guide gốc)

Guide gốc chỉ có 0% / 20% / 40%. Thực tế dùng **10%** rất thường xuyên.

### 10% = "Split Shopify fees equally" (mỗi bên chịu một nửa phí)

| Mức | Khi nào dùng |
|-----|--------------|
| **10%** | Khách counter/từ chối mức 20%; yearly plan (số tiền lớn); customer có thiện chí; muốn giữ quan hệ tốt |

**Bắt buộc:** khi áp 10%, phải gửi kèm **screenshot Shopify fee breakdown** làm proof (cho khách thấy mình thật sự chỉ nhận được earnings sau phí). Diễn giải: "We'll split the Shopify processing fees equally — each side covers half."

Cập nhật `deriveDeduction`:
```
has_prior_commitment       → 0%
feature_issue/service_fail/bad_review/trial/returning_customer → 0%
case === TH2               → 0%
num_cycles_requested >= 3  → 40% (nhưng xem lại mục 4 — có thể giảm để giữ khách)
yearly_plan OR customer_counters_20 → 10%
còn lại                    → 20%
```

Case thực tế: My Podologie ($792 yearly → 10% = $712.80), Boris/The Wanted Company ($11.60 → $10.44), Project Weekend ($29 → $26.10), SexStore ($29 → $26.10), Spiritual Hollywood ($24 → 10%).

---

## 2. Mở rộng full refund 0% — nhiều trigger mới (THIẾU)

Guide gốc chỉ có "team commitment". Bổ sung các trigger 0% deduction (full refund):

| Trigger | Nhận diện | Case thực tế |
|---------|-----------|--------------|
| **PageFly feature lỗi** | App malfunction, broken pages, editing bug | PRAVIO, Adalene Fashion |
| **Feature discontinued** | Tính năng khách mua đã bị gỡ (AI Sales Page...) | Lala Vape |
| **Service failure** | Support không reply nhiều ngày (≥3-5 ngày) | Drimsey (10 ngày) |
| **Bad review / 1-star** | Khách đã/đe doạ để review xấu | Somniora, Innergrade |
| **Trial period** | Cancel trong trial, chưa dùng | Zeenisa |
| **Accidental same-day + sẽ re-subscribe** | Trả nhầm thẻ, sẽ đăng ký lại | Gamtan (thẻ cá nhân→công ty) |
| **Customer returning** | Khách quay lại dùng tiếp | (re-subscribe cases) |

Khi gặp các trigger này → `deduction_percent = 0`, message kèm lời xin lỗi (nếu là lỗi PF/service) hoặc lời cảm ơn (nếu re-subscribe).

---

## 3. Trường hợp TỪ CHỐI refund — TH8 (HOÀN TOÀN THIẾU)

Guide gốc không có case decline. Đây là phần quan trọng — "lá chắn" theo Official Refund Policy.

### TH8: Decline (từ chối refund)

| Nhận diện | Hành động |
|-----------|-----------|
| **Dùng full cycle** — cancel SAU khi cycle kết thúc, dùng đủ 30 ngày | Từ chối. Giải thích cycle đã dùng hết. Offer refund nếu có charge mới cho partial cycle tiếp theo. |
| **Data chứng minh vẫn dùng app** — có published/updated pages gần đây | Từ chối kèm evidence (page title + dates). |
| **Multi-month lý do yếu** — active lâu, claim "accidental" nhiều tháng | Chỉ offer cycle cuối (goodwill), từ chối các tháng trước. |
| **Quá 7 ngày + không major problem** | Dùng Official Policy làm cơ sở. |

### Official Refund Policy (cơ sở từ chối)
Refund chỉ bắt buộc khi: major problem gây data loss/serious disturbance + trong vòng 7 ngày. KHÔNG có nghĩa vụ refund khi: đổi ý, mua nhầm, thiếu kỹ năng, xin goodwill, xin refund tháng trước.

### Tool mới cần có: `check_usage_data`
Input: store_url, period_start, period_end
Output: has_usage, published_pages[] (title, created_date, published_date), evidence_summary

→ Gọi khi khách claim "không dùng app" để verify trước khi quyết định.

Case thực tế: Skinergy (2 published + 3 updated pages tháng 5 → từ chối), Jusplaytoys/Savvy Munk/CalmBeezNL/Trapodox/Cosvu (full cycle used), SunYao (active 20 tháng).

---

## 4. ⚠️ CASE NHẠY CẢM — BẮT BUỘC MANAGER QUYẾT (QUAN TRỌNG NHẤT)

Đây là bổ sung quan trọng nhất từ bài học thực tế (case Innergrade — customer 2020, bị từ chối full-cycle-used → để bad review NGAY).

### Quy tắc: các case sau KHÔNG được Hugo tự quyết, PHẢI escalate Manager:

```
needs_manager (Boo) = num_cycles >= 3
                    OR TH5 (auto-upgrade)
                    OR has_prior_commitment
                    OR customer_loyal (subscription_active >= 2 years)  ← MỚI
                    OR high_value (yearly plan / multi-store / plan đắt) ← MỚI
                    OR is_frustrated / complained_multiple_times          ← MỚI
                    OR bad_review_risk (dấu hiệu sẽ để review xấu)        ← MỚI
                    OR already_left_bad_review                            ← MỚI
                    OR discount_commitment_claim (claim được hứa discount)← MỚI
```

### Ưu tiên đặc biệt cho KHÁCH DÙNG LÂU NĂM:
- Customer lâu năm (2+ năm) yêu cầu refund → **LUÔN ưu tiên** + **đợi Manager** quyết định, KỂ CẢ khi theo policy có thể từ chối.
- KHÔNG tự ý từ chối khách lâu năm dù dùng full cycle. Một bad review từ customer lâu năm hại hơn nhiều giá trị 1 cycle.
- Tone: acknowledge loyalty rõ ràng ("As a valued customer since [year]...").

### Nếu khách ĐÃ để bad review sau khi bị từ chối:
1. NGAY LẬP TỨC escalate Manager
2. Đổi hướng → full refund (0%) để recover
3. Xin lỗi, không giữ lập trường từ chối nữa
4. Ưu tiên recover relationship + review hơn là tiết kiệm tiền refund

Case thực tế: Innergrade (từ chối → bad review → phải đổi hướng), Keychron (discount commitment → Manager verify).

---

## 5. Con số refund chỉ là THAM KHẢO (nguyên tắc trình bày)

Bổ sung quan trọng về cách Hugo trình bày:

- Tool `calculate_refund` trả về con số là **ước tính tham khảo**, KHÔNG phải cam kết.
- Hugo trình bày dạng: "Based on our calculation, the estimated refund would be approximately $X" — KHÔNG nói "Your refund is exactly $X, confirmed."
- Với case cần Manager duyệt: nói rõ "This is subject to final approval from our team."
- KHÔNG đưa con số quá chắc chắn trước khi: (a) verify đủ data, (b) Manager duyệt (nếu cần), (c) bill đã Paid.
- Tránh tạo kỳ vọng cứng rồi phải rút lại → gây bad experience.

---

## 6. Bill FAILED payment + Store FROZEN (THIẾU)

Guide gốc có `bill_status: upcoming/unknown` nhưng thiếu **`failed`**.

### bill_status === "failed"
- Payment failed nhiều lần (Crown Club 14 lần, Carry Memento 12 lần, Satvakeshi).
- Store thường bị **frozen** vì unpaid bill.
- KHÔNG thể refund (chưa có tiền vào).

### Xử lý:
| Tình huống | Hành động |
|-----------|-----------|
| Store frozen + bill failed + khách cần reactivate gấp | Offer **App Credit** để offset charge → khách chỉ trả Shopify + apps khác → reactivate store. |
| Khách muốn đợi | Chờ Shopify retry → bill Paid → refund prorated. |

**Lưu ý App Credit:** chỉ offset phần PageFly charge, KHÔNG offset Shopify subscription/taxes/apps khác → phải nói rõ với khách.

Case thực tế: Crown Club ($99 credit, store frozen), Carry Memento ($14.40 credit), Satvakeshi ($24 credit).

---

## 7. Discount Adjustment — không phải refund thường (THIẾU)

Một loại case riêng: khách được hứa discount nhưng không được apply → bị overcharge.

### Nhận diện: khách claim "được hứa X% discount" + có email proof
### Xử lý:
1. **Verify email proof** — ai trong team hứa, % bao nhiêu, scope (1 store hay all stores).
2. Tính chênh lệch: (giá đang trả) − (giá đúng sau discount).
3. **Refund phần chênh** + apply discount going forward.
4. **Luôn cần Manager** (commitment + thường số tiền lớn).

Công thức: `refund_difference = current_price − (list_price × (1 − discount%))`

Case thực tế: Keychron NZ (đang trả $693, đúng phải $495 với 50% → refund $198), Keychron PH (tương tự $198). Proof: email từ Maru Le, coupon PFF3VBH4UR, áp dụng all stores.

---

## 8. Currency conversion note (THIẾU)

Nhiều bill hiện EUR/CAD/INR/AED nhưng charge thực tế là **USD**.

### Quy tắc:
- Luôn clarify với khách: "The charge appears as €X on your bill due to currency conversion, but the actual charge is $Y USD, and the refund will be processed in USD."
- Số tiền refund tính trên **USD amount** (theo dashboard), không phải số hiển thị trên bill.

Case thực tế: Bellure (€20.81 = $24), My Podologie (€ EUR), Ounira (AED), Trapodox (€), nhiều case INR/CAD.

---

## 9. Honor commitment — mở rộng (bot + colleague + bất kể đúng/sai số)

Guide có `has_prior_commitment` nhưng cần làm rõ:
- Honor cả **bot offer** (AI đã báo số), KHÔNG chỉ người thật.
- Honor **kể cả khi số bot/colleague tính sai** — nếu đã commit với khách thì giữ lời (trừ khi sai quá lớn → escalate).
- Honor colleague commitment — không override quyết định của đồng nghiệp đã hứa với khách.

Case thực tế: Homestead Lavender (bot tính $26.30 sai công thức nhưng vẫn honor), Delores (50% từ team trước), Keychron (Maru commit).

---

## 10. Multi-store / Cross-linked tickets (THIẾU)

### Vấn đề: 1 khách nhiều store, hoặc 1 case nhiều conversation thread → rủi ro refund 2 lần.

### Xử lý:
- State lưu theo `store_url` (guide đã có) — nhưng cần check thêm khi cùng customer email/nhiều store.
- Khi thấy cross-linked threads (cùng store, cùng charge) → chỉ xử lý 1 lần, link các thread.
- Keychron: mỗi store xử lý riêng nhưng cùng discount logic.
- Prakreti: 2 threads (Ansham + Info) cùng 1 ticket → không refund 2 lần.

### Bổ sung check: trước khi refund, verify `refunded_amount` trên dashboard. Nếu đã có refund (≠ 0) → KHÔNG refund lại (case Norux: Shopify đã tự refund unauthorized charge → mình không action).

---

## 11. Cancel-after-cycle-end vs Cancel-mid-cycle (làm rõ TH1)

Guide TH1 prorated nhưng cần phân biệt rõ:

| Tình huống | Kết quả |
|-----------|---------|
| Cancel **giữa** cycle (cancel_date < cycle_end) | Prorated phần chưa dùng → refund |
| Cancel **sau** cycle end (cancel_date > cycle_end) | Dùng full cycle đó → KHÔNG refund cycle đó (→ TH8 Decline). Chỉ refund nếu có charge mới cho partial cycle tiếp theo. |
| Cancel cùng ngày activate | Dùng 0 ngày → refund gần full (trừ deduction) |

**Quan trọng:** Shopify charge thường delay (invoiced sau cycle start vài ngày đến vài tuần). Đừng nhầm "invoiced date" với "cycle start date". Luôn tính theo cycle_start → cancel_date.

Case thực tế: Jusplaytoys (cancel 23/4 sau cycle end 19/4 → từ chối), nhiều case tương tự.

---

## 12. Tóm tắt các cập nhật cần làm vào handler

| Mục | Handler đã sửa | Trạng thái |
|-----|-----------------|:--:|
| Thêm 10% deduction | `classify_refund_case/handler.ts` `deriveDeduction` (+ input `is_yearly_plan`, `customer_counters_deduction`) + `calculate_refund` `DEDUCTION_REASONS[10]` | ✅ |
| Mở rộng 0% triggers | `deriveDeduction` (+ input `feature_issue`, `service_failure`, `is_trial_period`, `is_returning_customer`) | ✅ |
| Thêm TH8 Decline | `classify` (`applyDecline`, `isSensitive`, `hasFullRefundTrigger`) + enum TH8 ở classify/generate/save_case_state | ✅ |
| Tool `check_usage_data` | tool mới (triad) + `fixtures/usage.ts`, đăng ký ở lookup tier. **Lưu ý:** Partner API chưa expose page-usage → hiện fixture-backed; trả `data_source:"unavailable"` khi không có dữ liệu (KHÔNG coi là bằng chứng không dùng). Cần wire PageFly usage endpoint sau. | ✅ (fixture) |
| Manager check cho case nhạy cảm | `deriveManagerReasons` + output `manager_reason` (loyal ≥2y, high-value, frustrated, bad-review risk/đã review, discount claim) | ✅ |
| Con số = tham khảo | `generate_refund_message` (`REVIEW_NOTE`/`MANAGER_REVIEW_NOTE`, breakdown đổi sang "estimate") | ✅ |
| bill_status "failed" | `collect_refund_info` (blocker App Credit) + `generate_refund_message` (`BILL_FAILED_BLOCK`) + enum | ✅ |
| Discount adjustment case | `calculate_refund` (`discount_adjustment`, bỏ qua downgrade gate) + `generate_refund_message` (`discountAdjustmentBlock`, ép manager) | ✅ |
| Currency note | `generate_refund_message` (`currencyNote`, input `bill_currency`/`bill_display_amount`) | ✅ |
| Honor bot/colleague | `deriveDeduction` (`has_prior_commitment` → 0%) + làm rõ trong `.describe()` | ✅ |
| Multi-store / refunded check | `calculate_refund` (`already_refunded_amount > 0` → refuse); grouping qua `related_case_group` đã có sẵn | ✅ |
| Cancel-after-cycle-end | `calculate_refund` (clamp + `fullCycleNote` → gợi ý TH8); `classify` input `used_full_cycle` | ✅ |

---

*Bổ sung này phản ánh bài học từ ~70 case thực tế. Ưu tiên cao nhất: (1) case nhạy cảm + khách lâu năm BẮT BUỘC Manager duyệt, (2) con số refund chỉ là tham khảo, (3) TH8 Decline + check usage data làm lá chắn.*
