<?php
// Set headers
header('Content-Type: application/json');
ini_set('display_errors', 0); // Do not display errors to the client
ini_set('log_errors', 1);     // Log errors to the server's error log

// --- GET ENVIRONMENT VARIABLES ---
// These must be configured in your hosting environment (e.g., Heroku Config Vars)
$api_endpoint = getenv('API_ENDPOINT');
$api_token = getenv('API_TOKEN');

// --- VALIDATE ENVIRONMENT VARIABLES ---
if (empty($api_endpoint) || empty($api_token)) {
    http_response_code(500);
    $errorMsg = 'Server configuration error: API_ENDPOINT or API_TOKEN environment variables are not set.';
    error_log($errorMsg); // Log the specific error for debugging
    echo json_encode(['success' => false, 'error' => $errorMsg]);
    exit();
}

// --- PROCESS INCOMING REQUEST FROM SFMC ---
$requestBody = file_get_contents('php://input');
$decodedBody = json_decode($requestBody, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    $errorMsg = 'Invalid JSON received from Journey Builder.';
    error_log($errorMsg . ' Body: ' . $requestBody);
    echo json_encode(['success' => false, 'error' => $errorMsg]);
    exit();
}

// Extract the finalPayload from the inArguments array
$finalPayloadStr = '';
if (isset($decodedBody['inArguments']) && is_array($decodedBody['inArguments'])) {
    foreach ($decodedBody['inArguments'] as $arg) {
        if (isset($arg['finalPayload'])) {
            $finalPayloadStr = $arg['finalPayload'];
            break;
        }
    }
}

if (empty($finalPayloadStr)) {
    http_response_code(400);
    $errorMsg = 'Required "finalPayload" was not found in the inArguments from Journey Builder.';
    error_log($errorMsg . ' Full Request: ' . $requestBody);
    echo json_encode(['success' => false, 'error' => $errorMsg]);
    exit();
}

// --- CAMBIO CLAVE: Envolver el payload en un array para cumplir con el requisito de la API ---
$apiPayload = '[' . $finalPayloadStr . ']';
// -----------------------------------------------------------------------------------------

// --- PREPARE AND SEND REQUEST TO EXTERNAL API ---
$ch = curl_init();

curl_setopt($ch, CURLOPT_URL, $api_endpoint);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $apiPayload); // Usamos la nueva variable
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $api_token,
    'Content-Length: ' . strlen($apiPayload) // Y actualizamos la longitud
]);

$response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curl_error = curl_error($ch);
curl_close($ch);

// --- HANDLE EXTERNAL API RESPONSE ---
if ($curl_error) {
    http_response_code(500); // Internal Server Error
    $errorMsg = 'cURL Error while contacting the external API: ' . $curl_error;
    error_log($errorMsg);
    echo json_encode(['success' => false, 'error' => $errorMsg]);
    exit();
}

if ($http_code >= 400) {
    // The external API returned an error
    http_response_code(502); // Bad Gateway
    $errorMsg = "The external API returned an error (HTTP Status: {$http_code}).";
    error_log($errorMsg . " API Response: " . $response);
    echo json_encode([
        'success' => false,
        'error' => $errorMsg,
        'api_status' => $http_code,
        'api_response' => json_decode($response)
    ]);
    exit();
}

// If we reach here, the request was successful
http_response_code(200);
echo json_encode(['success' => true, 'api_status' => $http_code]);
?>
