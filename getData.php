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
 * * @param string $clientId El Client ID del paquete de API.
 * @param string $clientSecret El Client Secret del paquete de API.
 * @param string $subdomain El subdominio TSSD de la cuenta de SFMC.
 * @return string|null El token de acceso si tiene éxito.
 */
function getAccessToken($clientId, $clientSecret, $subdomain) {
    // Valida que las credenciales no estén vacías
    if (empty($clientId) || empty($clientSecret) || empty($subdomain)) {
        http_response_code(500);
        echo json_encode(['error' => 'Variables de entorno (SFMC_CLIENT_ID, SFMC_CLIENT_SECRET, SFMC_SUBDOMAIN) no están configuradas en el servidor.']);
        exit();
    }

    $auth_url = "https://{$subdomain}.auth.marketingcloudapis.com/v2/token";
    $payload = json_encode([
        'grant_type' => 'client_credentials',
        'client_id' => $clientId,
        'client_secret' => $clientSecret
    ]);

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $auth_url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);

    $response = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);

    // Si hubo un error a nivel de red (ej. no se pudo conectar, DNS malo, etc.)
    if ($err) {
        http_response_code(500);
        echo json_encode(['error' => 'cURL Error al contactar SFMC: ' . $err]);
        exit();
    }

    $decoded_response = json_decode($response);
    
    // Si la API de SFMC devolvió un error (ej. credenciales inválidas, acceso denegado)
    if (isset($decoded_response->error)) {
         http_response_code(401); // 401 Unauthorized es más apropiado aquí
         $errorMessage = isset($decoded_response->error_description) ? $decoded_response->error_description : 'Error desconocido de SFMC.';
         echo json_encode(['error' => 'SFMC Auth Error: ' . $decoded_response->error . ' - ' . $errorMessage]);
         exit();
    }

    // Si todo fue exitoso, devuelve el token
    return $decoded_response->access_token ?? null;
}

/**
 * Usa un token de acceso para obtener los datos de una Data Extension.
 * * @param string $accessToken El token de acceso válido.
 * @param string $subdomain El subdominio TSSD de la cuenta de SFMC.
 * @param string $deKey La External Key de la Data Extension.
 * @return object|null Los datos decodificados de la DE.
 */
function getDeData($accessToken, $subdomain, $deKey) {
    $de_url = "https://{$subdomain}.rest.marketingcloudapis.com/data/v1/customobjectdata/key/{$deKey}/rowset";
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $de_url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $accessToken
    ]);

    $response = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);

    if ($err) {
        http_response_code(500);
        echo json_encode(['error' => 'cURL Error al consultar la Data Extension: ' . $err]);
        exit();
    }
    
    return json_decode($response);
}

// --- LÓGICA PRINCIPAL DEL SCRIPT ---

// 1. Intentar obtener el token. La función se encargará de fallar con un error detallado si no puede.
$accessToken = getAccessToken($sfmc_client_id, $sfmc_client_secret, $sfmc_subdomain);

// 2. Si el script sigue ejecutándose, es porque obtuvimos un token. Ahora consultamos la DE.
$data = getDeData($accessToken, $sfmc_subdomain, $de_external_key);

// 3. Verificar que la respuesta de la DE sea válida y contenga la propiedad 'items'.
if (!$data || !isset($data->items)) {
    http_response_code(500);
    $errorMessage = isset($data->message) ? $data->message : 'La respuesta de la DE no contiene un array de items. Verifique la External Key.';
    echo json_encode(['error' => 'Error al leer la Data Extension: ' . $errorMessage]);
    exit();
}

// 4. Si todo fue exitoso, devolver el array de items.
echo json_encode($data->items);

?>
