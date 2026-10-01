-- 008_first_period_weight.sql
-- S16：班级当天有正课但第一节正课为空。保持软约束，不把受限课表变成无解。
-- 三个内置档位都给显著权重；学生优先最高，教师优先仍足以影响构造与精修。
UPDATE weight_profile
   SET payload = json_set(
     payload,
     '$.S16',
     CASE code
       WHEN 'teacher_first' THEN 160
       WHEN 'student_first' THEN 240
       ELSE 200
     END
   )
 WHERE code IN ('teacher_first', 'balanced', 'student_first');
