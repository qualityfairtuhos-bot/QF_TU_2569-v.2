# คู่มือส่งมอบระบบและการพัฒนาต่อยอด (System Handover & Architecture Specification)
**TUH Quality Fair & HACC Conference Management (ระบบบริหารจัดการงานมหกรรมคุณภาพ โรงพยาบาลธรรมศาสตร์เฉลิมพระเกียรติ)**

---

## สารบัญ (Table of Contents)
1. [ภาพรวมระบบและสถาปัตยกรรม (System Architecture Overview)](#1-ภาพรวมระบบและสถาปัตยกรรม-system-architecture-overview)
2. [โครงสร้างโฟลเดอร์และไฟล์สำคัญ (Project Structure)](#2-โครงสร้างโฟลเดอร์และไฟล์สำคัญ-project-structure)
3. [โครงสร้างฐานข้อมูลและชีตทั้งหมด (Full Database & Sheet Schema)](#3-โครงสร้างฐานข้อมูลและชีตทั้งหมด-full-database--sheet-schema)
4. [กระบวนการทำงานหลักของระบบ (Core Business Workflows)](#4-กระบวนการทำงานหลักของระบบ-core-business-workflows)
5. [ข้อห้าม ข้อจำกัด และกฎเหล็กสำคัญที่สุด (Strict Rules & Constraints)](#5-ข้อห้าม-ข้อจำกัด-และกฎเหล็กสำคัญที่สุด-strict-rules--constraints)
6. [แนวทางการพัฒนาต่อและการทดสอบ (Development, Build & Deployment Guide)](#6-แนวทางการพัฒนาต่อและการทดสอบ-development-build--deployment-guide)

---

## 1. ภาพรวมระบบและสถาปัตยกรรม (System Architecture Overview)

ระบบบริหารจัดการงานมหกรรมคุณภาพฯ ได้รับการออกแบบด้วยสถาปัตยกรรม **Dual Hybrid Engine**:
1. **Frontend Presentation & Reverse Proxy (Next.js 16 + React 19)**:
   - รันอยู่บนพอร์ต `3000` (Node.js runtime)
   - ให้บริการหน้า Portal หลัก 4 ส่วนผ่าน iframe Sandbox พร้อมระบบ Cache-Buster
   - มี `/api/gas` ทำหน้าที่เป็น Secure Reverse Proxy Relay คอยแปลงคำขอ RPC จากเว็บเบราว์เซอร์ ส่งต่อไปยัง Google Apps Script Web App เพื่อหลีกเลี่ยงปัญหา CORS, iframe cookie restrictions และรักษาความปลอดภัยของ Server-side Secret
2. **Backend Engine & Database Storage (Google Apps Script + Google Sheets + Google Drive)**:
   - Google Apps Script (GAS) ทำหน้าที่เป็น RPC Backend API จัดการ Logic, Data Validation, Security, Role-Based Access Control (RBAC), Email Notification, และ PDF/File Management
   - Google Sheets ทำหน้าที่เป็น Relational Database (43 ตาราง)
   - Google Drive ทำหน้าที่จัดเก็บเอกสาร, ไฟล์ผลงานต้นฉบับ, ไฟล์ Blind Review, สลิปโอนเงิน, ใบเสร็จรับเงิน, และเอกสารสรุปคะแนน

### 4 พอร์ทัลหลักของระบบ (Portals)
1. **Public / Registration Portal (`index.html.txt` / `/`)**:
   - ลงทะเบียนเข้าร่วมงาน (บุคลากรภายใน รพ. / บุคคลภายนอก)
   - ตรวจสอบสถานะการลงทะเบียน ชำระเงิน แนบสลิป
   - ส่งผลงานวิชาการ/นวัตกรรม (Works Submission) ตรวจสอบสถานะงานวิจัย
   - ดาวน์โหลดบัตรคูปองอาหารอิเล็กทรอนิกส์ (E-Meal Pass)
2. **Admin Portal (`admin.html.txt` / `/admin`)**:
   - แดชบอร์ดสรุปสถิติผู้เข้าร่วม ยอดชำระเงิน และผลงาน
   - ตรวจสอบการลงทะเบียน การเงิน ใบเสร็จรับเงิน
   - คัดกรองผลงาน (Academic Screening: PASS, RETURN, REJECT)
   - จ่ายงานกรรมการประเมินรอบที่ 1 และรอบที่ 2 (Reviewer Assignment)
   - ดูผลคะแนนการประเมิน, ตรวจสอบข้อคิดเห็น, ออกรายงานคะแนนรายผลงานและรายบุคคล
   - ตัดสินผลงาน (Final Decisions)
   - จัดการข้อมูลกรรมการ (Reviewer Pool), ตั้งค่าระบบ และ Email Templates
3. **Reviewer Portal (`reviewer.html.txt` / `/reviewer`)**:
   - พอร์ทัลสำหรับกรรมการผู้ทรงคุณวุฒิ เข้าสู่ระบบด้วย Email/Username
   - แยกแท็บผลงานชัดเจน: **"รอบประเมินผลงาน (รอบที่ 1)"** และ **"รอบตัดสินผลงาน (รอบที่ 2)"**
   - กรรมการอ่านผลงานแบบ Blind Review (ไม่เห็นชื่อผู้แต่ง/หน่วยงาน)
   - ให้คะแนนตามเกณฑ์แยกตามประเภทผลงาน (Service CQI / Research Innovation รวม 100 คะแนน)
   - กรณีรอบตัดสิน (รอบที่ 2) กรรมการสามารถดูประวัติคะแนนและความเห็นจากรอบที่ 1 เพื่อประกอบการพิจารณาได้
4. **Scanner Portal (`scanner.html.txt` / `/scanner`)**:
   - พอร์ทัลสำหรับเจ้าหน้าที่หน้างาน สแกน QR Code จาก E-Meal Pass ของผู้เข้าร่วม
   - ตรวจสอบสิทธิ์และบันทึกการรับประทานอาหารรายวัน (อาหารว่างเช้า, อาหารกลางวัน, อาหารว่างบ่าย)

---

## 2. โครงสร้างโฟลเดอร์และไฟล์สำคัญ (Project Structure)

```text
/
├── admin.html.txt             # ต้นฉบับหน้า Admin Portal (Single File HTML/JS/CSS)
├── reviewer.html.txt          # ต้นฉบับหน้า Reviewer Portal
├── index.html.txt             # ต้นฉบับหน้า Public / Registration Portal
├── scanner.html.txt           # ต้นฉบับหน้า On-site QR Scanner Portal
├── gas/
│   ├── Code.gs                # รวมโค้ด Backend Google Apps Script ฉบับเต็ม
│   ├── ApiActions.gs          # รายการ Action ที่อนุญาตให้เรียกใช้งาน
│   ├── ApiGateway.gs          # Router และ Dispatcher รับ Request จาก Next.js
│   ├── ApiResponse.gs         # Helper ส่ง Response JSON
│   ├── ApiSecurity.gs         # ตรวจสอบ Session, Hash, Permission
│   └── ApiSetupAndTests.gs    # ฟังก์ชันทดสอบการเชื่อมต่อ Database และ Drive
├── code.gs.txt                # ไฟล์คู่แฝดของ gas/Code.gs (ต้องเหมือนกัน 1:1 เสมอ)
├── tools/
│   ├── prepare-legacy.mjs     # สคริปต์คอมไพล์ *.html.txt -> public/legacy/*.html
│   └── audit-sources.mjs      # เครื่องมือ Audit โค้ดและความปลอดภัย
├── public/
│   ├── legacy/                # ไฟล์ผลลัพธ์หลังคอมไพล์ (ห้ามแก้ไขที่โฟลเดอร์นี้โดยตรง)
│   │   ├── admin.html
│   │   ├── reviewer.html
│   │   ├── index.html
│   │   └── scanner.html
│   └── images/                # โลโก้และ Asset รูปภาพท้องถิ่น
├── app/
│   ├── api/gas/route.ts       # Next.js Server-side Proxy ไปยัง Google Apps Script
│   ├── admin/page.tsx         # Next.js Route /admin
│   ├── reviewer/page.tsx      # Next.js Route /reviewer
│   ├── scanner/page.tsx       # Next.js Route /scanner
│   ├── layout.tsx             # Root Layout
│   └── page.tsx               # Next.js Route /
├── components/
│   ├── legacy-portal.tsx      # ตัวครอบ iframe แสดงผลหน้าเว็บ พร้อม Version Query
│   └── portal-page.tsx
├── tests/
│   └── *.test.mjs             # Test suite ตรวจสอบความถูกต้องของสัญญาระบบ
└── package.json               # คำสั่ง Build, Test, Dev และ Dependencies
```

---

## 3. โครงสร้างฐานข้อมูลและชีตทั้งหมด (Full Database & Sheet Schema)

ฐานข้อมูลทำงานอยู่บน Google Sheets จำนวน **43 ตาราง (Sheets)** ดังนี้:

### ตารางหลักระบบและการประชุม
1. **`Conferences`** (ข้อมูลงานประชุม):
   `ConferenceID` (PK), `ConferenceCode`, `ConferenceNameTH`, `ConferenceNameEN`, `ShortName`, `Year`, `Organizer`, `DescriptionTH`, `DescriptionEN`, `PrimaryColor`, `SecondaryColor`, `GreenColor`, `GoldColor`, `LogoFileId`, `LogoUrl`, `Venue`, `Address`, `EventStartAt`, `EventEndAt`, `RegistrationOpenAt`, `RegistrationCloseAt`, `PaymentCloseAt`, `SubmissionOpenAt`, `SubmissionCloseAt`, `ResultAnnouncementAt`, `PresentationUploadOpenAt`, `PresentationUploadCloseAt`, `PublicStatus`, `Status`, `CreatedAt`, `UpdatedAt`
2. **`Settings`** (การตั้งค่าระบบ):
   `SettingID` (PK), `ConferenceID` (FK), `SettingKey`, `SettingValue`, `ValueType`, `GroupName`, `DescriptionTH`, `DescriptionEN`, `IsEditable`, `UpdatedAt`, `UpdatedBy`
3. **`Users`** (ผู้ใช้งานระบบแอดมินและเจ้าหน้าที่):
   `UserID` (PK), `Username`, `Email`, `PasswordHash`, `Salt`, `Prefix`, `FirstName`, `LastName`, `FullName`, `Phone`, `Organization`, `Role`, `Status`, `LastLogin`, `CreatedAt`, `UpdatedAt`
4. **`UserConferenceRoles`** (บทบาทของผู้ใช้ในงานประชุม):
   `UserConferenceRoleID` (PK), `ConferenceID` (FK), `UserID` (FK), `Role`, `PermissionsJson`, `Status`, `AssignedAt`, `AssignedBy`
5. **`Sessions`** (เซสชันการเข้าสู่ระบบ):
   `SessionID` (PK), `ConferenceID` (FK), `UserID` (FK), `Role`, `TokenHash`, `ExpiresAt`, `LastSeenAt`, `ClientInfo`, `Status`

### ตารางการลงทะเบียนและการเงิน
6. **`RegistrationTypes`** (ประเภทการลงทะเบียนและค่าธรรมเนียม):
   `RegistrationTypeID` (PK), `ConferenceID` (FK), `TypeCode`, `TypeNameTH`, `TypeNameEN`, `IsInternal`, `FeeAmount`, `Quota`, `UsedQuota`, `PaymentRequired`, `WorkRequiresPayment`, `Active`, `SortOrder`
7. **`OrganizationUnits`** (โครงสร้างหน่วยงาน / ฝ่าย / สาขาวิชา):
   `UnitID` (PK), `ConferenceID` (FK), `ParticipantGroup`, `ParentUnitID`, `UnitLevel`, `UnitNameTH`, `UnitNameEN`, `Active`, `SortOrder`
8. **`Registrations`** (ข้อมูลการลงทะเบียน):
   `RegID` (PK), `ConferenceID` (FK), `SourceType`, `SourceBatchID`, `SourceRowNo`, `SourceTimestamp`, `SourceRespondentEmail`, `ConsentAccepted`, `ConsentVersion`, `ParticipantType`, `Region4Status`, `Prefix`, `FirstName`, `LastName`, `FullName`, `Position`, `OrganizationGroup`, `OrganizationUnit`, `Institution`, `Profession`, `LicenseNo`, `CID`, `Passport`, `Phone`, `LineID`, `Email`, `FoodType`, `FoodAllergyDetail`, `AttendanceDay1`, `AttendanceDay2`, `AttendanceDay3`, `WantsSubmitWork`, `DataCompletenessStatus`, `RegistrationStatus`, `PaymentStatus`, `MealPassStatus`, `EditAccessCodeHash`, `Note`, `CreatedAt`, `UpdatedAt`, `LastModifiedBy`
9. **`Consents`** (การยอมรับข้อตกลง PDPA):
   `ConsentID` (PK), `ConferenceID` (FK), `RegID` (FK), `ConsentVersion`, `ConsentAccepted`, `AcceptedAt`, `ClientInfo`
10. **`Payments`** (ข้อมูลการชำระเงิน):
    `PaymentID` (PK), `ConferenceID` (FK), `RegID` (FK), `Amount`, `Currency`, `PaymentChannelID`, `SlipFileId`, `SlipFileUrl`, `SlipFileName`, `Status`, `SubmittedAt`, `VerifiedBy`, `VerifiedAt`, `FinanceNote`, `ReceiptNo`, `ReceiptDate`, `ReceiptFileId`, `ReceiptFileUrl`, `CreatedAt`, `UpdatedAt`
11. **`PaymentChannels`** (ช่องทางการชำระเงินและบัญชีธนาคาร):
    `PaymentChannelID` (PK), `ConferenceID` (FK), `BankName`, `AccountName`, `AccountNumber`, `PromptPay`, `QRFileId`, `QRFileUrl`, `InstructionTH`, `InstructionEN`, `Active`, `SortOrder`
12. **`ImportBatches`** (ประวัติการนำเข้าไฟล์ Excel/Google Forms):
    `ImportBatchID` (PK), `ConferenceID` (FK), `SourceFileName`, `SourceFileId`, `SourceSheetName`, `UploadedBy`, `UploadedAt`, `TotalRows`, `ReadyRows`, `IncompleteRows`, `WarningRows`, `DuplicateRows`, `ImportedRows`, `Status`, `MappingVersion`, `Note`
13. **`ImportRows`** (แถวข้อมูลที่นำเข้า):
    `ImportRowID` (PK), `ImportBatchID` (FK), `ConferenceID` (FK), `SourceRowNo`, `SourceTimestamp`, `SourceFingerprint`, `SourceDataJson`, `MappedDataJson`, `ValidationStatus`, `IssueCount`, `ImportStatus`, `ImportedRegID`, `CreatedAt`
14. **`ImportIssues`** (ปัญหาหรือข้อผิดพลาดจากการนำเข้าข้อมูล):
    `ImportIssueID` (PK), `ImportBatchID` (FK), `ImportRowID` (FK), `ConferenceID` (FK), `IssueType`, `FieldName`, `MessageTH`, `MessageEN`, `Severity`, `Resolved`, `ResolvedBy`, `ResolvedAt`

### ตารางผลงานวิชาการและการจัดการไฟล์
15. **`WorkCategories`** (หมวดหมู่ผลงาน):
    `CategoryID` (PK), `ConferenceID` (FK), `CategoryCode`, `CategoryNameTH`, `CategoryNameEN`, `DescriptionTH`, `Active`, `SortOrder`
    *(SERVICE: Service Excellence, CQI: CQI/Best Practice, PRIMARY: Primary Care, RESEARCH: วิจัย, INNOVATION: นวัตกรรม)*
16. **`PresentationTypes`** (รูปแบบการนำเสนอ):
    `PresentationTypeID` (PK), `ConferenceID` (FK), `TypeCode`, `TypeNameTH`, `TypeNameEN`, `PresentationMinutes`, `QAMinutes`, `NeedsRoom`, `NeedsPoster`, `Active`, `SortOrder` *(ORAL, EPOSTER)*
17. **`Works`** (ผลงานวิชาการ):
    `WorkID` (PK), `ConferenceID` (FK), `RegID` (FK), `WorkCode`, `CategoryID`, `PresentationTypeRequested`, `PresentationTypeFinal`, `TitleTH`, `TitleEN`, `SummaryTH`, `Keywords`, `EthicsRequired`, `EthicsApprovalNo`, `Region4AwardIntent`, `ScreeningStatus`, `ScreeningNote`, `Status`, `FinalDecision`, `RevisionDeadline`, `PresentationUploadStatus`, `CreatedAt`, `UpdatedAt`, `LastModifiedBy`
18. **`WorkAuthors`** (คณะผู้จัดทำผลงาน):
    `AuthorID` (PK), `ConferenceID` (FK), `WorkID` (FK), `AuthorOrder`, `Prefix`, `FirstName`, `LastName`, `FullName`, `Position`, `Organization`, `Email`, `Phone`, `IsPresenter`, `IsCorrespondingAuthor`
19. **`WorkFiles`** (ไฟล์แนบของผลงานบน Google Drive):
    `WorkFileID` (PK), `ConferenceID` (FK), `WorkID` (FK), `RegID` (FK), `AssignmentID`, `FileCategory`, `VersionNo`, `FileName`, `FileId`, `FileUrl`, `MimeType`, `FileSize`, `UploadedBy`, `UploadedAt`, `Active`, `ReplacedFileID`, `Note`
    *(FileCategory: ORIGINAL, BLIND, WORD, PRESENTER_BIO, FINAL_PRESENTATION, REVISION)*
20. **`Templates`** (เทมเพลตเอกสารดาวน์โหลด):
    `TemplateID` (PK), `ConferenceID` (FK), `TemplateKey`, `TemplateNameTH`, `TemplateNameEN`, `DescriptionTH`, `FileId`, `FileUrl`, `Active`, `SortOrder`, `UpdatedAt`

### ตารางการประเมินผลและกรรมการ (Review Engine)
21. **`ReviewRounds`** (รอบการประเมิน):
    `ReviewRoundID` (PK), `ConferenceID` (FK), `RoundNo`, `RoundNameTH`, `RoundNameEN`, `StartAt`, `EndAt`, `MinReviewers`, `MaxReviewers`, `BlindReview`, `AllowEditAfterSubmit`, `AllowDecline`, `CalculationMethod`, `PassingScore`, `Status`, `SortOrder`
    *(Round 1: รอบประเมินผลงาน / Round 2: รอบตัดสินผลงาน)*
22. **`Reviewers`** (ข้อมูลกรรมการผู้ทรงคุณวุฒิ):
    `ReviewerID` (PK), `Prefix`, `FirstName`, `LastName`, `FullName`, `Position`, `Institution`, `Department`, `Province`, `HealthRegion`, `Phone`, `Email`, `ExpertiseCategories`, `ExpertiseTypes`, `MaxWorkload`, `Status`, `NotificationPreference`, `LineToken`, `TelegramID`, `Note`, `CreatedAt`, `UpdatedAt`
23. **`ReviewerPool`** (กลุ่มกรรมการประจำงานประชุม):
    `PoolID` (PK), `ConferenceID` (FK), `ReviewerID` (FK), `ExpertiseCategories`, `ExpertiseTypes`, `MaxWorkload`, `CurrentAssignedCount`, `ConflictOrganizations`, `Status`, `AssignedAt`, `AssignedBy`
24. **`ReviewerConflicts`** (การบันทึกข้อขัดแย้งทางผลประโยชน์):
    `ConflictID` (PK), `ConferenceID` (FK), `ReviewerID` (FK), `WorkID` (FK), `Organization`, `ConflictType`, `Note`, `Status`, `CreatedAt`
25. **`ReviewAssignments`** (การมอบหมายผลงานให้กรรมการ):
    `AssignmentID` (PK), `ConferenceID` (FK), `ReviewRoundID` (FK), `WorkID` (FK), `WorkCode`, `ReviewerID` (FK), `ReviewerName`, `ReviewerEmail`, `AssignedAt`, `AssignedBy`, `Status`, `OpenedAt`, `CompletedAt`, `TotalScore`, `Decision`, `RecommendationToAuthor`, `InternalComment`, `DeclineReason`, `AnnotatedFileId`, `AnnotatedFileUrl`, `Locked`, `UpdatedAt`
26. **`ScoringCriteria`** (เกณฑ์การให้คะแนน):
    `CriteriaID` (PK), `ConferenceID` (FK), `ReviewRoundID` (FK), `CategoryID`, `PresentationTypeID`, `ItemNo`, `CriteriaNameTH`, `CriteriaNameEN`, `DescriptionTH`, `MaxScore`, `WeightPercent`, `RequiredComment`, `Active`, `SortOrder`
    *(⚠️ รอบ 1 ใช้ CriteriaID ดั้งเดิม: CRIT-2026-000006 ถึง CRIT-2026-000018 ห้ามสร้างใหม่เด็ดขาด)*
27. **`ReviewScores`** (คะแนนรายข้อย่อยที่กรรมการบันทึก):
    `ScoreID` (PK), `ConferenceID` (FK), `AssignmentID` (FK), `ReviewRoundID` (FK), `WorkID` (FK), `ReviewerID` (FK), `CriteriaID` (FK), `Score`, `WeightedScore`, `Comment`, `CreatedAt`, `UpdatedAt`
28. **`ReviewSummary`** (สรุปผลการประเมินของกรรมการแต่ละท่าน):
    `SummaryID` (PK), `ConferenceID` (FK), `AssignmentID` (FK), `ReviewRoundID` (FK), `WorkID` (FK), `ReviewerID` (FK), `TotalScore`, `Decision`, `RecommendationToAuthor`, `InternalComment`, `CreatedAt`, `UpdatedAt`
29. **`FinalDecisions`** (มติการตัดสินผลงาน):
    `DecisionID` (PK), `ConferenceID` (FK), `WorkID` (FK), `ReviewRoundID` (FK), `DecisionType`, `DecisionBy`, `DecisionAt`, `AverageScore`, `MedianScore`, `ScoreSD`, `Reason`, `AuthorVisibleComment`, `InternalComment`, `IsFinal`, `CreatedAt`

### ตารางคูปองอาหารและการเข้าร่วมงาน
30. **`MealEntitlements`** (สิทธิ์รับประทานอาหาร):
    `EntitlementID` (PK), `ConferenceID` (FK), `RegID` (FK), `EventDate`, `MealCode`, `MealNameTH`, `Eligible`, `RedeemedAt`, `RedeemedBy`, `ScannerPoint`, `TokenHash`, `Status`, `CreatedAt`
31. **`MealScans`** (ประวัติการสแกนรับอาหาร):
    `ScanID` (PK), `ConferenceID` (FK), `RegID` (FK), `EntitlementID` (FK), `EventDate`, `MealCode`, `ScanAt`, `ScannerUserID`, `ScannerPoint`, `Result`, `Note`
32. **`AttendanceCheckIns`** (ประวัติการเช็คอินเข้าร่วมงาน):
    `CheckInID` (PK), `ConferenceID` (FK), `RegID` (FK), `EventDate`, `CheckInAt`, `CheckInPoint`, `CheckedBy`, `Status`, `Note`

### ตารางสถานที่และกำหนดการนำเสนอ
33. **`Venues`** (สถานที่จัดงาน):
    `VenueID` (PK), `ConferenceID` (FK), `VenueNameTH`, `VenueNameEN`, `Address`, `MapUrl`, `Status`
34. **`Rooms`** (ห้องนำเสนอ):
    `RoomID` (PK), `ConferenceID` (FK), `VenueID` (FK), `RoomCode`, `RoomNameTH`, `RoomNameEN`, `Capacity`, `RoomType`, `Status`
35. **`PresentationSessions`** (รอบการนำเสนอ):
    `SessionID` (PK), `ConferenceID` (FK), `SessionCode`, `SessionNameTH`, `SessionNameEN`, `PresentationTypeID`, `CategoryID`, `VenueID`, `RoomID`, `SessionDate`, `StartTime`, `EndTime`, `MaxWorks`, `PublishStatus`, `Note`
36. **`PresentationSlots`** (ช่วงเวลาการนำเสนอรายผลงาน):
    `SlotID` (PK), `ConferenceID` (FK), `SessionID` (FK), `WorkID` (FK), `WorkCode`, `SlotNo`, `PresentationDate`, `StartTime`, `EndTime`, `PresenterCheckInStatus`, `PresentationStatus`, `PublishStatus`, `Note`
37. **`PosterAssignments`** (การจัดบอร์ดโปสเตอร์):
    `PosterAssignmentID` (PK), `ConferenceID` (FK), `WorkID` (FK), `WorkCode`, `PosterNo`, `DisplayDate`, `DisplayStartTime`, `DisplayEndTime`, `Location`, `PublishStatus`, `Note`

### ตารางระบบสื่อสาร บันทึกการทำงาน และสแนปช็อต
38. **`EmailTemplates`** (แม่แบบอีเมล):
    `EmailTemplateID` (PK), `ConferenceID` (FK), `TemplateKey`, `TemplateNameTH`, `SubjectTH`, `SubjectEN`, `HtmlBodyTH`, `HtmlBodyEN`, `Variables`, `Status`, `UpdatedAt`, `UpdatedBy`
39. **`EmailLogs`** (ประวัติการส่งอีเมล):
    `EmailLogID` (PK), `ConferenceID` (FK), `SentAt`, `SentBy`, `To`, `Subject`, `RelatedType`, `RelatedID`, `Status`, `ErrorMessage`
40. **`AuditLogs`** (ประวัติการใช้งานของผู้ดูแลระบบ):
    `AuditLogID` (PK), `ConferenceID` (FK), `Timestamp`, `UserID`, `UserEmail`, `Role`, `Action`, `TargetType`, `TargetID`, `DetailsJson`, `ClientInfo`
41. **`SystemLogs`** (บันทึกข้อผิดพลาดระบบ):
    `SystemLogID` (PK), `Timestamp`, `Level`, `FunctionName`, `Message`, `StackTrace`, `ConferenceID`, `UserEmail`, `ClientInfo`
42. **`DashboardSnapshots`** (บันทึกสถิติรายวัน):
    `SnapshotID` (PK), `ConferenceID` (FK), `Timestamp`, `TotalRegistrations`, `InternalCount`, `ExternalCount`, `PaidCount`, `PendingPaymentCount`, `TotalRevenue`, `TotalWorks`, `UnderReviewCount`, `AcceptedOralCount`, `AcceptedPosterCount`, `MealRedeemedCount`, `JsonDetail`
43. **`การตอบแบบฟอร์ม 1`** (ชีตรับข้อมูลต้นทางจาก Google Forms):
    ข้อมูลดิบ 57 คอลัมน์ที่ Sync จาก Google Form สำหรับนำเข้าผ่าน Import Batches

---

## 4. กระบวนการทำงานหลักของระบบ (Core Business Workflows)

### 4.1 กระบวนการประเมินผลงาน 2 รอบ (Two-Stage Review Workflow)
1. **รอบที่ 1: รอบประเมินผลงาน (Screening / Main Review)**:
   - กรรมการแต่ละท่านได้รับมอบหมายงาน (ปกติ 2-3 ท่านต่องาน)
   - เกณฑ์คะแนนมี 6-7 ข้อ รวม **100 คะแนนเต็ม**
     - หมวดหมู่ Service Excellence / CQI / Primary Care: 6 ข้อ (10 + 10 + 30 + 25 + 20 + 5)
     - หมวดหมู่วิจัยและนวัตกรรม: 7 ข้อ (5 + 15 + 10 + 20 + 20 + 20 + 10)
   - กรรมการตรวจอ่านไฟล์ PDF แบบปกปิดชื่อ (Blind) และให้คะแนนรายข้อ + ความเห็น
   - ระบบคำนวณคะแนนเฉลี่ย (`AverageScore`) บันทึกลงในผลงาน
2. **รอบที่ 2: รอบตัดสินผลงาน (Final Decision Round)**:
   - ผลงานที่ผ่านการคัดเลือกเข้าสู่รอบตัดสิน จะได้รับการมอบหมายกรรมการรอบ 2
   - เพิ่มเกณฑ์ **"การนำเสนอผลงานและตอบข้อซักถาม (10 คะแนน)"** รวมเป็น 7-8 ข้อ (100 คะแนนเต็ม)
   - กรรมการรอบตัดสินสามารถกดดูประวัติผลการประเมินและความเห็นของรอบที่ 1 เพื่อประกอบการตัดสินใจได้

### 4.2 การคำนวณคะแนนและการป้องกันคะแนนเพี้ยน
- ระบบคำนวณคะแนนจริงจากการรวม `Score` ใน `ReviewScores` ที่ตรงกับ `CriteriaID` ที่ใช้งานอยู่
- มีระบบ Auto-heal ในตัว: หากพบว่า `TotalScore` ที่บันทึกไว้ใน `ReviewAssignments` ไม่ตรงกับผลรวมของคะแนนรายข้อย่อย ระบบจะปรับแก้ให้ตรงกับคะแนนจริงของกรรมการทันที (ไม่ใช่การปัดเศษเป็น 100)

---

## 5. ข้อห้าม ข้อจำกัด และกฎเหล็กสำคัญที่สุด (Strict Rules & Constraints)

⚠️ **สำหรับวิศวกรซอฟต์แวร์และ AI ทุกตัวที่มารับช่วงต่อ โปรดอ่านและปฏิบัติตามกฎเหล่านี้อย่างเคร่งครัด:**

1. **ห้ามลบ สร้างใหม่ หรือ Reset ข้อมูลใน `ScoringCriteria` สำหรับรอบที่ 1 เด็ดขาด**:
   - คะแนนประเมินของกรรมการทั้งหมดในตาราง `ReviewScores` ผูกอยู่กับ `CriteriaID` เดิมของรอบ 1 (`CRIT-2026-000006` ถึง `CRIT-2026-000018`)
   - หากมีการลบชีต หรือใช้คำสั่งลบแล้วใส่ข้อมูลใหม่ จะทำให้ `CriteriaID` เปลี่ยน และส่งผลให้คะแนนประเมินที่บันทึกไว้แล้วหายไปหรือเพี้ยนทันที
   - ฟังก์ชัน `seedScoringCriteria_` ถูกตั้งค่าให้เป็น Empty Function ห้ามใส่โค้ด auto-seed ทับ
2. **ห้ามรันคำสั่งแก้ไขข้อมูล (Write/Sync) ใน API ฝั่งอ่านข้อมูล (Read/GET)**:
   - ห้ามเรียก `syncOfficialCriteria_` หรือฟังก์ชันที่แตะต้องแผ่นงานใน `adminGetReviewConfig`, `adminBootstrap`, `reviewerBootstrap`, หรือ `doGet`
   - การซิงค์เกณฑ์ต้องเกิดขึ้นเมื่อ Admin กดปุ่มตั้งค่าเกณฑ์รอบ 2 อย่างชัดเจนเท่านั้น
3. **การตรวจสอบรอบตัดสิน (Round 2) ต้องใช้ Helper `isRound2_` เท่านั้น**:
   - ❌ **ห้ามเขียน**: `roundId.includes('2')` หรือ `ReviewRoundID.indexOf('2') >= 0` เพราะรหัสรอบประเมินมีเลขปี พ.ศ. เช่น `RR-2026-000001` ซึ่งมีเลข `2` อยู่ จะทำให้ระบบเข้าใจผิดว่ารอบ 1 คือรอบตัดสินทั้งหมด
   - ✔️ **ต้องเขียน**: ใช้ฟังก์ชัน `isRound2_(roundOrAssignment)` ซึ่งตรวจเช็ค `RoundNo === 2` หรือชื่อรอบมีคำว่า `ตัดสิน` อย่างแม่นยำ
4. **การแสดงจำนวน Reviewer ในตารางแอดมิน ต้องแยกตัวเลขรอบ 1 และรอบตัดสิน**:
   - รอบ 1 แสดงจำนวนประเมินแล้ว/ที่มอบหมาย เช่น `3/3`
   - รอบตัดสิน (ถ้ามี) แสดงเป็น Badge แยกด้านล่าง เช่น `🏆 ตัดสิน: 0/1`
   - ❌ **ห้ามนำตัวเลขมารวมกันเป็น `3/4`** เพราะจะทำให้ผู้ดูแลระบบเข้าใจผิดว่ากรรมการรอบ 1 ยังประเมินไม่ครบ
5. **การแก้ไข Frontend Portals ต้องทำที่ไฟล์ `.html.txt` เท่านั้น**:
   - ห้ามแก้ไขไฟล์ในโฟลเดอร์ `/public/legacy/*.html` โดยตรง เพราะเป็นไฟล์คอมไพล์ที่จะถูกเขียนทับเสมอเมื่อรัน Build
   - เมื่อแก้ไข `admin.html.txt`, `reviewer.html.txt`, `index.html.txt` หรือ `scanner.html.txt` แล้ว **ต้องรันคำสั่ง `node tools/prepare-legacy.mjs` เสมอ**
6. **ความสอดคล้องระหว่าง `gas/Code.gs` และ `code.gs.txt`**:
   - เมื่อแก้ไขโค้ด backend ใน `gas/Code.gs` ต้องคัดลอกไปยัง `code.gs.txt` ด้วยเสมอ (`cp gas/Code.gs code.gs.txt`) เพื่อให้ผู้ดูแลระบบสามารถนำโค้ดไปวางใน Google Apps Script Editor ได้อย่างแม่นยำ
7. **สไตล์ปุ่ม Action ในตารางผลงาน (Admin Works Table)**:
   - ปุ่มในคอลัมน์จัดการ (Actions) ต้องระบุ Inline CSS `!important` และคลาส `.btn-action-*` ที่กำหนดสีพื้นหลังและสีไอคอนสีขาว (`#ffffff`) ให้ชัดเจนเสมอ เพื่อป้องกัน CSS `.btn-sq` กลืนจนกลายเป็นปุ่มสีขาวว่างเปล่า

---

## 6. แนวทางการพัฒนาต่อและการทดสอบ (Development, Build & Deployment Guide)

### 6.1 คำสั่งที่ใช้ในการพัฒนา
- **ติดตั้ง Dependencies**:
  ```bash
  npm install
  ```
- **คอมไพล์ไฟล์ HTML Portals**:
  ```bash
  npm run prepare:legacy
  # หรือ node tools/prepare-legacy.mjs
  ```
- **ทดสอบระบบ (Test Suite)**:
  ```bash
  npm test
  ```
- **ทดสอบการสร้าง Next.js Production Build**:
  ```bash
  npm run build
  ```
- **รันเซิร์ฟเวอร์สำหรับทดสอบ**:
  ```bash
  npm run dev
  ```

### 6.2 การ Deploy ไปยัง Google Apps Script (GAS)
1. เปิดโปรเจกต์ Google Apps Script ที่ผูกกับ Google Sheet งานประชุม
2. คัดลอกเนื้อหาทั้งหมดจากไฟล์ **`code.gs.txt`** ไปวางในไฟล์ `Code.gs` ของ Apps Script Editor
3. ใน Apps Script ให้สร้างไฟล์ HTML 4 ไฟล์:
   - `admin.html` (คัดลอกจาก `admin.html.txt`)
   - `reviewer.html` (คัดลอกจาก `reviewer.html.txt`)
   - `index.html` (คัดลอกจาก `index.html.txt`)
   - `scanner.html` (คัดลอกจาก `scanner.html.txt`)
4. กด **Deploy > New deployment** เลือกประเภท **Web app**:
   - Execute as: **Me (เจ้าของสคริปต์)**
   - Who has access: **Anyone (ทุกคน)**
5. บันทึก Web App URL และนำมาระบุในค่า Config ของ Next.js `/api/gas` หากต้องการเชื่อมต่อผ่าน Vercel/Cloud Run

### 6.3 การ Deploy Frontend ไปยัง Vercel / Cloud Run
- โครงการรองรับการ deploy ขึ้น Vercel หรือ Google Cloud Run ได้ทันที
- คำสั่ง Build ใน `package.json` ได้ตั้งค่า `prebuild` ให้รัน `prepare-legacy.mjs` อัตโนมัติ จึงมั่นใจได้ว่าไฟล์ใน `public/legacy/` จะอัปเดตเป็นเวอร์ชันล่าสุดเสมอในการ Deploy ทุกครั้ง
