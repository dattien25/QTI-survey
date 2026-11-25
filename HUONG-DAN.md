# QTI – Bảng hỏi Tương tác Giáo viên (bản tương tác)

| File | Đặt ở đâu | Vai trò |
|---|---|---|
| `index.html` | GitHub | Trang web: làm bài và quản trị |
| `app.js` | GitHub | Toàn bộ logic giao diện |
| `config.js` | GitHub | Dán đường dẫn Web App |
| `Code.gs` | Google Apps Script (trong Google Sheet) | Backend lưu dữ liệu. **Không** đưa lên GitHub |
| `fonts/` | GitHub | Bộ chữ CDA Mê Ly Display + CDA Independence VAR (đã kèm sẵn) |
| `vendor/` | GitHub | Thư viện tạo file Word (docx.js, giấy phép MIT), chỉ tải khi bấm “Báo cáo Word” |

> Nếu `API_URL` trong `config.js` để trống, trang chạy ở **chế độ demo**: dữ liệu chỉ nằm trong trình duyệt. Tài khoản demo:
> - chủ trang: *Trần Minh Anh*;
> - quản trị: *Lê Hoàng Bảo*, *Phạm Thu Chi*, *Đỗ Quang Dũng*;
> - mật khẩu của cả 4 tài khoản: `demo`.

---

## Phân quyền và bảo mật

| Vai trò | Quyền |
|---|---|
| **Chủ trang** (1 người, là bạn) | Toàn quyền. Là người duy nhất được **thêm hoặc gỡ quản trị viên** và **đặt lại mật khẩu** cho họ. |
| **Quản trị viên** (ví dụ 4 người cùng thuyết trình) | Điều khiển phiên khảo sát, xem tiến trình, xem kết quả, sửa cài đặt và danh sách lớp. |
| **Người tham gia** | Chỉ làm bài và xem kết quả của chính mình. Nút **Đăng nhập quản trị** ở cuối trang ai cũng thấy, nhưng chỉ người có tên trong nhóm quản trị và đúng mật khẩu mới vào được. |

Mật khẩu được lưu như sau:
- **Không có mật khẩu nào nằm trong code** hay trong Google Sheet.
- Mật khẩu chỉ được lưu dưới dạng **băm**: thêm một chuỗi ngẫu nhiên riêng cho mỗi người (muối), rồi băm SHA-256 lặp 400 lần. Kết quả nằm trong *Script Properties* của Apps Script, nên không ai đọc lại được mật khẩu gốc, kể cả chủ trang.
- Khi đăng nhập thành công, trình duyệt chỉ nhận một **token ngẫu nhiên**. Token hết hạn sau 6 giờ hoặc khi bấm *Thoát*, và mất ngay khi đóng tab.
- Nhập sai **5 lần** thì tài khoản bị **khoá 10 phút**.
- Quản trị viên mới nhận một **mật khẩu tạm** và **bắt buộc đổi** ở lần đăng nhập đầu.
- Khi bị gỡ quyền, người đó **mất quyền truy cập ngay lập tức**.

---

## Bước 1 – Tạo Google Sheet và backend

1. Vào <https://sheets.new> để tạo Google Sheet mới, rồi mở **Tiện ích mở rộng → Apps Script**.
2. Xoá hết code mẫu, dán **toàn bộ** nội dung `Code.gs` vào, rồi bấm 💾 **Lưu**.
3. Chọn hàm **`setup`** và bấm **▶ Chạy**. Khi Google hỏi, cấp quyền theo thứ tự: **Xem lại quyền → chọn tài khoản → Nâng cao → Đi tới … → Cho phép**.
4. Mở **Nhật ký thực thi**, bạn sẽ thấy **MÃ THIẾT LẬP CHỦ TRANG** có dạng `QTI-AB12-CD34`. Hãy ghi lại mã này.
   - Nếu cần xem lại mã: tải lại Google Sheet → menu **QTI → Hiện mã thiết lập chủ trang**.

## Bước 2 – Danh sách lớp (đã nạp sẵn)

Khi bạn chạy `setup` ở Bước 1, danh sách **TS. Tạ Thanh Hoa + 48 học viên** (lớp LLPP1 – Tâm lí học giảng dạy ngoại ngữ) được **tự động nạp** vào tab **Roster**.

- `setup` chỉ **thêm tên còn thiếu**, không xoá hay ghi đè tên đã có, nên chạy lại cũng không bị trùng. Nếu bạn đã chạy `setup` ở bản trước (48 tên), dán `Code.gs` mới và chạy lại `setup` để thêm tên cô.
- Hai bạn trùng tên *Nguyễn Thị Ngọc Anh* được phân biệt bằng mã học viên: `(26045018)` và `(26045019)`.
- Để sửa danh sách, có hai cách:
  - thêm một dòng vào tab Roster, cột A;
  - dùng trang quản trị, tab **Danh sách lớp**.
- File `danh-sach-lop.txt` chứa sẵn 49 tên, phòng khi bạn cần dán lại.

## Bước 3 – Triển khai Web App

1. Bấm **Triển khai → Tùy chọn triển khai mới → Ứng dụng web**.
2. Chọn **Thực thi dưới dạng: Tôi** và **Người có quyền truy cập: Bất kỳ ai**.
3. Bấm **Triển khai**, rồi sao chép URL kết thúc bằng `/exec`.

## Bước 4 – Đưa lên GitHub Pages

1. Dán URL vừa sao chép vào `config.js`, ở dòng `API_URL: '...'`.
2. Tạo repo GitHub ở chế độ **Public**, rồi **Upload files** gồm `index.html`, `app.js`, `config.js` **và hai thư mục `fonts/`, `vendor/`**. Bạn có thể kéo thả nguyên thư mục vào trang upload; nhớ giữ đúng tên thư mục.
3. Vào **Settings → Pages**, chọn *Deploy from a branch* → **main** / **(root)** → **Save**. Đợi khoảng 1 phút, trang sẽ có địa chỉ `https://<tên>.github.io/<repo>/`.

## Bước 5 – Tạo tài khoản chủ trang (chỉ làm một lần)

1. Mở trang web, bấm nút **Đăng nhập quản trị** ở cuối trang (hoặc mở thẳng `https://<tên>.github.io/<repo>/#admin`).
2. Trang hiện ô **Thiết lập chủ trang**. Nhập **mã thiết lập** ở Bước 1, **tên của bạn** (nên đúng như trong danh sách lớp) và **mật khẩu** (ít nhất 6 ký tự).
3. Mã thiết lập chỉ dùng được **một lần**. Sau khi bạn tạo xong, không ai khác dùng lại được.

## Bước 6 – Thêm nhóm quản trị

1. Vào trang quản trị, mở tab **Quản trị viên** (chỉ chủ trang thấy tab này).
2. Chọn hoặc gõ tên từng người, giữ hoặc sửa **mật khẩu tạm**, rồi bấm **Thêm**.
3. Gửi riêng mật khẩu tạm cho từng người, có nút **Sao chép**. Mật khẩu tạm chỉ hiện **một lần**.
4. Người được thêm có hai cách đăng nhập:
   - chọn tên mình trên trang chính → **Quản trị**;
   - bấm **Đăng nhập quản trị** ở cuối trang (hoặc mở link `#admin`).
   
   Sau đó nhập mật khẩu tạm, và trang sẽ bắt họ đặt mật khẩu riêng.
5. Nếu ai đó quên mật khẩu, bấm **Đặt lại mật khẩu** cạnh tên họ. Nếu muốn bỏ quyền, bấm **Gỡ quyền**.

> **Chủ trang quên mật khẩu:** mở Google Sheet → menu **QTI → Đặt lại chủ trang**. Thao tác này xoá tài khoản chủ trang (các quản trị viên khác giữ nguyên) và tạo mã thiết lập mới. Sau đó làm lại Bước 5.

---

## Hệ chữ (CDA Type — Mê Ly & Independence)

Trang dùng bộ chữ trong design system *CDA Type — Mê Ly & Independence*. Font đã nằm sẵn trong thư mục `fonts/`. Cả hai font đều cấp phép **SIL OFL 1.1**, được nhúng lên web miễn phí (giấy phép ở `fonts/LICENSE-FONTS.txt`).

| Font | Dùng cho |
|---|---|
| **CDA Mê Ly Display** (Bold 700) | Tiêu đề lớn (từ 28px trở lên) và con số lớn: đồng hồ đếm ngược, ô thống kê, nút chọn 1–5 |
| **CDA Independence VAR**, cắt *Text* (SRFF 2, đậm 420) | Toàn bộ chữ thường, nút bấm, bảng |
| **CDA Independence VAR**, cắt *Deck* (SRFF 5) | Nội dung câu hỏi và đoạn giới thiệu |
| **CDA Independence VAR**, cắt *Display* (SRFF 10) | Tiêu đề phụ và dòng tiếng Anh dưới tiêu đề lớn |

---

## Sau khi nộp bài: gợi ý và xuất kết quả

Phần **Gợi ý cho bạn** dựa trên tài liệu *Gợi ý cho giáo viên sau QTI* của nhóm (Williams & Burden, 1997). Tài liệu dùng ba mức điểm: **thấp 6–14 · trung bình 15–21 · cao 22–30**.

| Thang đo | Cần chú ý khi |
|---|---|
| Nhóm A: Dẫn dắt, Thấu hiểu, Thân thiện | ≤ 21 |
| Nhóm B: Thiếu quyết đoán, Không hài lòng, Khiển trách | ≥ 15 (được ưu tiên trước) |
| Nghiêm khắc | ≥ 22, hoặc câu 48 ≥ 3 |
| Trao quyền | ≤ 12 hoặc ≥ 22 |

Phần gợi ý gồm:
1. **Hồ sơ gần nhất**: một trong 6 hồ sơ kết hợp của tài liệu, ví dụ *Dẫn dắt ấm áp* hay *Căng thẳng, thiếu tin tưởng*, kèm hướng ưu tiên.
2. **Bắt đầu ngay**: 3–5 việc nhỏ làm được trong 1–2 tuần.
3. **Gợi ý chi tiết cho 1–2 thang ưu tiên**: ý nghĩa của thang và các gợi ý thực hành có số trang tham chiếu.
4. **Phát huy điểm mạnh**: lấy từ mục "Nếu điểm đã cao" của tài liệu.
5. **Lộ trình hành động 7 bước** trong một học kỳ.
6. **Ba điều cần nhớ** và nguồn tham chiếu.

Bảng điểm hiện mức (thấp / trung bình / cao), hướng mong muốn của từng thang, và đánh dấu **Cần chú ý** ở những thang vượt ngưỡng. Bản tiếng Anh của các gợi ý do Claude dịch từ tài liệu tiếng Việt.

Người đã nộp bài có thể **lưu kết quả**:

- **Xuất ảnh**: một ảnh dọc (PNG, rộng 1080px) gồm biểu đồ, bảng điểm, nhận xét, hồ sơ, việc làm ngay, 3 gợi ý đầu của mỗi thang ưu tiên và lưu ý. Trên điện thoại, nhấn giữ vào ảnh để lưu vào thư viện.
- **Báo cáo Word** (.docx): gồm thông tin, biểu đồ, bảng điểm (có mức và cờ "cần chú ý"), nhận xét và toàn bộ phần gợi ý (hồ sơ, bắt đầu ngay, gợi ý chi tiết, lộ trình 7 bước), lưu ý, nguồn tham chiếu và phụ lục 48 câu trả lời.

Cả hai đều theo ngôn ngữ đang chọn (VI, EN hoặc song ngữ). Quản trị viên cũng xuất được kết quả của từng người: vào tab **Kết quả**, bấm vào tên một người.

> Trong **bản xem thử trên Claude**, trình duyệt chặn tải file, nên nút "Tải về" và "Báo cáo Word" chỉ chạy khi trang được đưa lên GitHub Pages. Riêng ảnh vẫn hiện để xem.

## Điều khiển một buổi khảo sát

1. **Cài đặt**:
   - **Cách tính giờ**: *Cả lớp cùng lúc*, *Riêng từng người* hoặc *Không giới hạn*.
   - **Số phút**: mặc định 3.
   - **Khi hết giờ**: *Tự nộp phần đã làm* hoặc *Khoá bài*.
   - **Ngôn ngữ mặc định**.
   - **Phụ đề**.
2. Bấm **Phiên mới**, rồi **Mở phòng chờ**. Gửi **link chính** (không có `#admin`) cho cả lớp. Mọi người tìm tên mình rồi chờ.
3. Bấm **Bắt đầu tính giờ**. Trong lúc lớp làm bài, tab **Tiến trình** cho thấy từng người: chưa vào, đang chờ, đang làm (đã làm bao nhiêu câu, còn bao lâu) hay đã nộp. Có nút **+1 phút** để gia hạn.
4. Bấm **Kết thúc** để đóng phiên. Tab **Kết quả** có:
   - biểu đồ trung bình cả lớp;
   - bảng điểm của từng người (bấm vào một dòng để xem chi tiết);
   - nút **Mở Google Sheet** và **Tải CSV**.

> 💡 Nên chạy thử một phiên với nhóm trước, sau đó bấm **Phiên mới** để buổi thật bắt đầu sạch.

## Dữ liệu trong Google Sheet (tab Responses)

Mỗi bài nộp là một dòng gồm:

- **Thông tin chung**: Thời gian · Phiên · Họ tên · Mã lượt · Cách nộp · Số câu đã trả lời · Thời gian làm (giây).
  - Cách nộp: `manual` (tự bấm nộp), `timeout` (hết giờ tự nộp), `ended` hoặc `admin_end` (nộp khi phiên kết thúc).
- **8 điểm thang đo**: mỗi thang là tổng 6 câu, nằm trong khoảng 6–30. Nếu thiếu câu, điểm = trung bình các câu đã trả lời × 6.
- **Câu trả lời** `Q1…Q48`.

Bảng quy đổi thang đo:

| Mã | Thang đo | Câu |
|---|---|---|
| Lea | Lãnh đạo – Dẫn dắt | 1, 5, 9, 13, 17, 21 |
| Und | Thấu hiểu | 2, 6, 10, 14, 18, 22 |
| Unc | Thiếu quyết đoán | 3, 7, 11, 15, 19, 23 |
| Adm | Hay khiển trách | 4, 8, 12, 16, 20, 24 |
| HFr | Thân thiện – Giúp đỡ | 25, 29, 33, 37, 41, 45 |
| SRe | Trao quyền tự chủ cho HS | 26, 30, 34, 38, 42, 46 |
| Dis | Không hài lòng | 27, 31, 35, 39, 43, 47 |
| Str | Nghiêm khắc | 28, 32, 36, 40, 44, 48 |

## Lưu ý kỹ thuật

- **Sau khi sửa `Code.gs`**: vào **Triển khai → Quản lý bản triển khai → ✏ → Phiên bản mới → Triển khai**. URL giữ nguyên.
- **Nâng cấp từ bản trước**: dán `Code.gs` mới vào rồi chạy lại `setup` để lấy mã thiết lập chủ trang. Cột "Vai trò" cũ trong tab Roster không còn dùng nữa; quyền quản trị giờ được cấp ở tab **Quản trị viên**.
- **Lỗi đánh máy đã sửa so với bản PDF gốc**:
  - câu 2: "I trusts" → "I trust";
  - câu 25: "I help us…" → "I help students…";
  - nhãn "Sre" → "SRe".
