<?php
// Establece la cabecera para asegurar que la respuesta siempre sea de tipo JSON.
header('Content-Type: application/json');

// --- OBTENER CREDENCIALES ---
// Lee las variables de entorno configuradas en el servidor (Heroku Config Vars).
$sfmc_client_id = getenv('SFMC_CLIENT_ID');
$sfmc_client_secret = getenv('SFMC_CLIENT_SECRET');
$sfmc_subdomain = getenv('SFMC_SUBDOMAIN');
$de_external_key = getenv('DE_EXTERNAL_KEY');

/**
 * Obtiene un token de acceso de la API de SFMC.
 * Si falla, terminará la ejecución del script y devolverá un error JSON detallado.
 * @param string $clientId El Client ID del paquete de API.
 * @param string $clientSecret El Client Secret del paquete de API.
 * @param string $subdomain El subdominio TSSD de la cuenta de SFMC.
 * @return string|null El token de acceso si tiene éxito.
 */
function getAccessToken($clientId, $clientSecret, $subdomain) {
    if (empty($clientId) || empty($clientSecret) || empty($subdomain)) {
        http_response_code(500);
        echo json_encode(['error' => 'Variables de entorno (SFMC_CLIENT_ID, SFMC_CLIENT_SECRET, SFMC_SUBDOMAIN) no están configuradas en el servidor.']);
        exit();
    }
    $auth_url = "https://{$subdomain}.auth.marketingcloudapis.com/v2/token";
    $payload = json_encode(['grant_type' => 'client_credentials', 'client_id' => $clientId, 'client_secret' => $clientSecret]);
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $auth_url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    $response = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);
    if ($err) {
        http_response_code(500);
        echo json_encode(['error' => 'cURL Error al contactar SFMC: ' . $err]);
        exit();
    }
    $decoded_response = json_decode($response);
    if (isset($decoded_response->error)) {
        http_response_code(401);
        $errorMessage = isset($decoded_response->error_description) ? $decoded_response->error_description : 'Error desconocido de SFMC.';
        echo json_encode(['error' => 'SFMC Auth Error: ' . $decoded_response->error . ' - ' . $errorMessage]);
        exit();
    }
    return $decoded_response->access_token ?? null;
}

/**
 * Usa un token de acceso para obtener los datos de una Data Extension.
 * @param string $accessToken El token de acceso válido.
 * @param string $subdomain El subdominio TSSD de la cuenta de SFMC.
 * @param string $deKey La External Key de la Data Extension.
 * @return object|null Los datos decodificados de la DE.
 */
function getDeData($accessToken, $subdomain, $deKey) {
    $de_url = "https://{$subdomain}.rest.marketingcloudapis.com/data/v1/customobjectdata/key/{$deKey}/rowset";
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $de_url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $accessToken]);
    
    // SOLUCIÓN FINAL: Forzar el uso de TLSv1.2 para resolver problemas de conexión de red (error 596).
    curl_setopt($ch, CURLOPT_SSL_VERSION, CURL_SSLVERSION_TLSv1_2);

    $response = curl_exec($ch);
    $err = curl_error($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($response === false) {
        http_response_code(500);
        echo json_encode([
            'error' => 'La llamada cURL a la DE falló y no devolvió contenido.',
            'curl_error_message' => $err,
            'http_status_code' => $http_code
        ]);
        exit();
    }
    
    if ($http_code >= 400) {
        http_response_code($http_code);
        echo json_encode([
            'error' => 'SFMC devolvió un código de estado de error al consultar la DE.',
            'http_status_code' => $http_code,
            'sfmc_response_body' => json_decode($response)
        ]);
        exit();
    }

    return json_decode($response);
}

// --- LÓGICA PRINCIPAL DEL SCRIPT ---

$accessToken = getAccessToken($sfmc_client_id, $sfmc_client_secret, $sfmc_subdomain);
$data = getDeData($accessToken, $sfmc_subdomain, $de_external_key);

if (!$data || !isset($data->items)) {
    http_response_code(500);
    $fullErrorResponse = json_encode($data, JSON_PRETTY_PRINT); 
    echo json_encode([
        'error' => 'La respuesta de SFMC no contenía la propiedad "items". Respuesta completa: ' . $fullErrorResponse
    ]);
    exit();
}

// Si todo fue exitoso, devolver el array de items.
echo json_encode($data->items);

?>
