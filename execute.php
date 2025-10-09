<?php
// Set headers
header('Content-Type: application/json');
ini_set('display_errors', 0);
ini_set('log_errors', 1);

// --- OBTENER EL CUERPO DE LA PETICIÓN ---
$requestBody = file_get_contents('php://input');
error_log("--- INCOMING JB PAYLOAD --- \n" . $requestBody . "\n--------------------------\n");

// --- OBTENER CREDENCIALES ---
$api_token = getenv('API_TOKEN');
$endpoint_directora = getenv('API_ENDPOINT_DIRECTORA');
$endpoint_asesora = getenv('API_ENDPOINT_ASESORA');

// --- PROCESAR DATOS DE ENTRADA ---
$decodedBody = json_decode($requestBody, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid JSON received from Journey Builder.']);
    exit();
}

$finalPayloadStr = '';
$botSeleccionado = '';
if (isset($decodedBody['inArguments']) && is_array($decodedBody['inArguments'])) {
    foreach ($decodedBody['inArguments'] as $arg) {
        if (isset($arg['finalPayload'])) {
            $finalPayloadStr = $arg['finalPayload'];
        }
        if (isset($arg['botSeleccionado'])) {
            $botSeleccionado = $arg['botSeleccionado'];
        }
    }
}

if (empty($finalPayloadStr)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Required "finalPayload" was not found in the inArguments.']);
    exit();
}

// --- LÓGICA DE DECISIÓN DEL ENDPOINT ---
$endpoint_a_usar = '';
$botSeleccionadoLower = strtolower(trim($botSeleccionado));

if ($botSeleccionadoLower === 'cami directora' && !empty($endpoint_directora)) {
    $endpoint_a_usar = $endpoint_directora;
    // --- LOG ACTUALIZADO ---
    error_log("Bot 'cami directora' detectado. Usando endpoint: " . $endpoint_a_usar);
} else {
    $endpoint_a_usar = $endpoint_asesora;
    // --- LOG ACTUALIZADO ---
    error_log("Bot por defecto ('" . $botSeleccionado . "') detectado. Usando endpoint: " . $endpoint_a_usar);
}

if (empty($endpoint_a_usar)) {
    http_response_code(500);
    $errorMsg = 'Server configuration error: No API endpoint could be determined for the selected bot.';
    error_log($errorMsg . " Bot detectado: " . $botSeleccionado);
    echo json_encode(['success' => false, 'error' => $errorMsg]);
    exit();
}
// ------------------------------------------

$apiPayload = '[' . $finalPayloadStr . ']';

// --- ENVIAR PETICIÓN A LA API EXTERNA ---
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $endpoint_a_usar);
// ... (el resto del código no cambia)
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $apiPayload);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: ' . $api_token,
    'Content-Length: ' . strlen($apiPayload)
]);

$response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curl_error = curl_error($ch);
curl_close($ch);

if ($curl_error) {
    http_response_code(500);
    error_log('cURL Error: ' . $curl_error);
    echo json_encode(['success' => false, 'error' => 'cURL Error while contacting the external API: ' . $curl_error]);
    exit();
}

if ($http_code >= 400) {
    http_response_code(502);
    error_log("External API Error (HTTP {$http_code}): " . $response);
    echo json_encode([
        'success' => false, 'error' => "The external API returned an error (HTTP Status: {$http_code}).",
        'api_status' => $http_code, 'api_response' => json_decode($response)
    ]);
    exit();
}

http_response_code(200);
echo json_encode(['success' => true, 'api_status' => $http_code]);
?>
