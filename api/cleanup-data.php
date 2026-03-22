<?php
require_once 'config/database.php';

header('Content-Type: application/json');

$database = new Database();
$conn = $database->getConnection();

try {
    // Start transaction
    $conn->beginTransaction();

    // Delete all data in order (respecting foreign keys)
    $conn->exec("DELETE FROM employment");
    $conn->exec("DELETE FROM graduates");
    $conn->exec("DELETE FROM programs");

    // Insert new 4 programs
    $conn->exec("INSERT INTO programs (id, name, code, description) VALUES
    (1, 'Bachelor of Science in Computer Science', 'BSCS', 'Computer Science program'),
    (2, 'Bachelor of Science in Hospitality Management', 'BSHM', 'Hospitality Management program'),
    (3, 'Bachelor of Secondary Education', 'BSED', 'Secondary Education program'),
    (4, 'Bachelor of Elementary Education', 'BEED', 'Elementary Education program')");

    // Insert new graduates
    $conn->exec("INSERT INTO graduates (student_id, first_name, last_name, email, phone, program_id, year_graduated) VALUES
    ('2019-0001', 'Juan', 'Dela Cruz', 'juan@email.com', '09171234567', 1, 2019),
    ('2019-0002', 'Maria', 'Santos', 'maria@email.com', '09179876543', 1, 2019),
    ('2019-0003', 'Jose', 'Reyes', 'jose@email.com', '09171112233', 2, 2019),
    ('2019-0004', 'Anna', 'Garcia', 'anna@email.com', '09174445566', 3, 2019),
    ('2019-0005', 'Pedro', 'Mendoza', 'pedro@email.com', '09177778899', 4, 2019),
    ('2020-0001', 'Clara', 'Bautista', 'clara@email.com', '09171010101', 1, 2020),
    ('2020-0002', 'Carlos', 'Rivera', 'carlos@email.com', '09172020202', 1, 2020),
    ('2020-0003', 'Rosa', 'Aquino', 'rosa@email.com', '09173030303', 2, 2020),
    ('2020-0004', 'Miguel', 'Torres', 'miguel@email.com', '09174040404', 3, 2020),
    ('2020-0005', 'Elena', 'Villanueva', 'elena@email.com', '09175050505', 4, 2020),
    ('2021-0001', 'Rafael', 'Cruz', 'rafael@email.com', '09176060606', 1, 2021),
    ('2021-0002', 'Sofia', 'Ramos', 'sofia@email.com', '09177070707', 1, 2021),
    ('2021-0003', 'Diego', 'Fernandez', 'diego@email.com', '09178080808', 2, 2021),
    ('2021-0004', 'Lucia', 'Gonzales', 'lucia@email.com', '09179090909', 3, 2021),
    ('2021-0005', 'Marco', 'Pascual', 'marco@email.com', '09170101010', 4, 2021),
    ('2022-0001', 'Isabel', 'Morales', 'isabel@email.com', '09171111111', 1, 2022),
    ('2022-0002', 'Andre', 'Lopez', 'andre@email.com', '09172222222', 2, 2022),
    ('2022-0003', 'Carmen', 'Perez', 'carmen@email.com', '09173333333', 2, 2022),
    ('2022-0004', 'Luis', 'Castillo', 'luis@email.com', '09174444444', 3, 2022),
    ('2022-0005', 'Patricia', 'Navarro', 'patricia@email.com', '09175555555', 4, 2022)");

    // Get the graduate IDs in order
    $stmt = $conn->query("SELECT id FROM graduates ORDER BY created_at ASC LIMIT 20");
    $graduates = $stmt->fetchAll(PDO::FETCH_COLUMN);

    // Employment data matching graduate IDs
    $employmentData = [
        [$graduates[0], 'Tech Solutions Inc.', 'Web Developer', 'IT', 'employed', 'aligned', '2019-08-15', 25000, 3],
        [$graduates[1], 'DataCore Systems', 'Software Engineer', 'IT', 'employed', 'aligned', '2019-09-01', 28000, 4],
        [$graduates[2], 'Grand Hotel Manila', 'Hotel Manager', 'Hospitality', 'employed', 'aligned', '2019-07-15', 24000, 2],
        [$graduates[3], 'Norzagaray National HS', 'Secondary Science Teacher', 'Education', 'employed', 'aligned', '2019-07-01', 22000, 2],
        [$graduates[4], 'Bulakan Elementary School', 'Elementary Teacher', 'Education', 'employed', 'aligned', '2019-06-15', 20000, 1],
        [$graduates[5], 'CloudTech Corp', 'Full Stack Developer', 'IT', 'employed', 'aligned', '2020-10-01', 30000, 4],
        [$graduates[6], 'Global Systems Co.', 'IT Support Specialist', 'IT', 'employed', 'aligned', '2020-09-15', 22000, 3],
        [$graduates[7], 'Paradise Resort', 'Chef', 'Hospitality', 'employed', 'aligned', '2020-08-01', 23000, 2],
        [$graduates[8], 'Bulacan State College', 'Secondary Mathematics Teacher', 'Education', 'employed', 'aligned', '2020-08-01', 21000, 2],
        [$graduates[9], 'Norzagaray Central School', 'Elementary Teacher', 'Education', 'employed', 'aligned', '2020-07-15', 20000, 1],
        [$graduates[10], 'NetWave Solutions', 'Network Admin', 'IT', 'employed', 'aligned', '2021-09-01', 26000, 3],
        [$graduates[11], 'AppDev Studio', 'Mobile Developer', 'IT', 'employed', 'aligned', '2021-10-15', 32000, 4],
        [$graduates[12], 'Bayview Hotel', 'Front Office Manager', 'Hospitality', 'employed', 'aligned', '2021-08-01', 22000, 2],
        [$graduates[13], 'City High School', 'Secondary English Teacher', 'Education', 'employed', 'aligned', '2021-07-15', 22000, 1],
        [$graduates[14], 'Lakeview School', 'Elementary Grade Teacher', 'Education', 'employed', 'aligned', '2021-06-15', 20000, 0],
        [$graduates[15], 'CyberLink Tech', 'Junior Developer', 'IT', 'employed', 'aligned', '2022-08-01', 23000, 2],
        [$graduates[16], 'Sunrise Cafe & Bistro', 'Restaurant Manager', 'Hospitality', 'employed', 'partially_aligned', '2022-09-01', 20000, 3],
        [$graduates[17], 'Seaside Lodging', 'Receptionist', 'Hospitality', 'employed', 'aligned', '2022-07-01', 18000, 2],
        [$graduates[18], 'Provincial School District', 'Secondary Teacher', 'Education', 'employed', 'aligned', '2022-09-01', 21000, 2],
        [$graduates[19], null, null, null, 'unemployed', 'not_aligned', null, null, 0],
    ];

    // Insert employment records
    $stmt = $conn->prepare("INSERT INTO employment (graduate_id, company_name, job_title, industry, employment_status, is_aligned, date_hired, monthly_salary, time_to_employment)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    foreach ($employmentData as $data) {
        $stmt->execute($data);
    }

    $conn->commit();

    echo json_encode([
        "success" => true,
        "message" => "All old data (BSIT and BSBA) has been removed and replaced with new 4 departments!",
        "graduates_count" => count($graduates)
    ]);
} catch(Exception $e) {
    $conn->rollBack();
    echo json_encode([
        "success" => false,
        "error" => $e->getMessage()
    ]);
}
?>
