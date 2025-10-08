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
// Lee ambos endpoints
$endpoint_asesora = getenv('API_ENDPOINT');
$endpoint_comunica = getenv('API_ENDPOINT_COMUNICA');


// --- PROCESAR DATOS DE ENTRADA ---
$decodedBody = json_decode($requestBody, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid JSON received from Journey Builder.']);
    exit();
}

// Extraer finalPayload y botSeleccionado
$finalPayloadStr = '';
$botSeleccionado = ''; // Por defecto, vacío
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
if ($botSeleccionado === 'Cami comunica' && !empty($endpoint_comunica)) {
    $endpoint_a_usar = $endpoint_comunica;
    error_log("Bot 'Cami comunica' detectado. Usando API_ENDPOINT_COMUNICA.");
} else {
    $endpoint_a_usar = $endpoint_asesora;
    error_log("Bot por defecto o 'Cami asesora' detectado. Usando API_ENDPOINT.");
}

if (empty($endpoint_a_usar)) {
    http_response_code(500);
    $errorMsg = 'Server configuration error: No API endpoint could be determined.';
    error_log($errorMsg);
    echo json_encode(['success' => false, 'error' => $errorMsg]);
    exit();
}
// ------------------------------------------

$apiPayload = '[' . $finalPayloadStr . ']';

// --- ENVIAR PETICIÓN A LA API EXTERNA ---
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $endpoint_a_usar); // Usa la variable dinámica
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $apiPayload);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: ' . $api_token,
    'Content-Length: ' . strlen($apiPayload)
]);

$response = curl_exec($ch);
// ... el resto del código de manejo de respuesta sigue igual ...
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
