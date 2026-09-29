-- Two branches built the same features twice; the merge keeps one of each.
--
-- Exam schedule: the Exam module's ExamTimetable (per class + subject, with
-- total/passing marks used by results) is kept. Wave C's parallel
-- ExamTimetableSlot held the same facts without marks; the public website's
-- exam routine now reads ExamTimetable.
DROP TABLE IF EXISTS "ExamTimetableSlot";

-- Grade bands: Wave C's GradingScale/GradeBand (grade points, remarks,
-- multiple scales, one default) is kept. The Exam module's flat ExamGrade
-- bands are retired; grading reads the default scale everywhere.
DROP TABLE IF EXISTS "ExamGrade";

-- Website lists: the site builder (Sites) renders sliders, galleries/albums,
-- video galleries, FAQs and programme cards as page blocks on the public
-- website. The flat WebsiteItem list duplicated those and was never shown
-- publicly, so it is retired.
DROP TABLE IF EXISTS "WebsiteItem";
DROP TYPE IF EXISTS "WebsiteItemType";
