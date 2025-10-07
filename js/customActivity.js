'use strict';

// Postmonger connection setup
var connection = new Postmonger.Session();

// Global objects
var payload = {};
var deData = [];
var journeySchemaFields = [];

// Waits for the document to be ready, then calls onRender
$(window).ready(onRender);

// Subscribes to Journey Builder events
connection.on('initActivity', initialize);
connection.on('clickedNext', save);
connection.on('requestedSchema', handleSchema);

/**
 * The client-side code that executes when the Custom Activity editor is rendered.
 */
function onRender() {
    connection.trigger('ready');
    $('#plantillaSelect').on('change', function() {
        var selectedPlantillaName = $(this).val();
        updateUIForSelectedPlantada(selectedPlantillaName);
    });
}

/**
 * Initializes the activity.
 * @param {object} data - The activity's saved configuration.
 */
function initialize(data) {
    if (data) payload = data;
    connection.trigger('requestSchema');
}

/**
 * Handles the schema response from Journey Builder.
 * @param {object} schemaData - The schema object.
 */
function handleSchema(schemaData) {
    if (schemaData && schemaData.schema) {
        journeySchemaFields = [];
        schemaData.schema.forEach(function(field) {
            if (field.key && !field.key.startsWith('Event.APIEvent')) {
                journeySchemaFields.push({ name: field.name, key: field.key });
            }
        });
    }
    fetchDataFromDE();
}

/**
 * Fetches template data from the server.
 */
function fetchDataFromDE() {
    $.ajax({
        url: "getData.php",
        method: 'GET',
        success: function(data) {
            deData = data;
            populateDropdown(deData);
            restoreUiState();
            $('#loader').addClass('hidden');
            $('#config-form').removeClass('hidden');
        },
        error: function(xhr, status, error) {
            console.error("Error fetching DE data:", status, xhr.responseText);
            $('#loader').html('<p class="text-danger">Error al cargar las plantillas.</p>');
        }
    });
}

/**
 * Restores the UI to its previously saved state.
 */
function restoreUiState() {
    var inArguments = (payload['arguments'] && payload['arguments'].execute && payload['arguments'].execute.inArguments) ? payload['arguments'].execute.inArguments : [];
    var args = {};
    inArguments.forEach(arg => { for (let key in arg) args[key] = arg[key]; });

    if (args.plantillaSeleccionada) {
        $('#plantillaSelect').val(args.plantillaSeleccionada);
        updateUIForSelectedPlantada(args.plantillaSeleccionada);
        if (args.variablesConfiguradas) {
            try {
                var savedVars = JSON.parse(args.variablesConfiguradas);
                $('.variable-selector').each(function() {
                    var varId = $(this).attr('id');
                    if (savedVars[varId]) $(this).val(savedVars[varId]);
                });
            } catch (e) {
                console.error("Could not parse saved variables", e);
            }
        }
    }
}

/**
 * Populates the main template dropdown.
 * @param {Array} data - The array of template data.
 */
function populateDropdown(data) {
    var $select = $('#plantillaSelect');
    $select.empty().append('<option value="">-- Seleccione una plantilla --</option>');
    data.forEach(function(row) {
        if (row.keys.plantilla) {
            $select.append($('<option>', { value: row.keys.plantilla, text: row.keys.plantilla }));
        }
    });
}

/**
 * Creates a dropdown for a journey variable.
 * @param {string} id - The ID for the select element.
 * @param {string} label - The label for the dropdown.
 * @returns {jQuery} A jQuery object of the dropdown.
 */
function createVariableSelector(id, label) {
    var selectHtml = `<div class="mb-2"><label for="${id}" class="form-label small">${label}</label><select class="form-select variable-selector" id="${id}"><option value="">-- Seleccione un Campo del Journey --</option></select></div>`;
    var $selectWrapper = $(selectHtml);
    var $select = $selectWrapper.find('.variable-selector');
    journeySchemaFields.forEach(function(field) {
        $select.append($('<option>', { value: '{{' + field.key + '}}', text: field.name }));
    });
    return $selectWrapper;
}

/**
 * Updates the UI based on the selected template.
 * @param {string} plantillaName - The name of the selected template.
 */
function updateUIForSelectedPlantada(plantillaName) {
    $('#variablesContainer, #mediaContainer .media-preview, #botDisplay').addClass('hidden');
    $('#videoPreview, #imagenPreview, #documentoPreview').addClass('hidden');
    $('#variablesContainer').empty();
    if (!plantillaName) return;

    var selectedRow = deData.find(row => row.keys.plantilla === plantillaName);
    if (!selectedRow) return;

    var values = selectedRow.values;
    if (values.bot) {
        $('#botName').text(values.bot);
        $('#botDisplay').removeClass('hidden');
    }
    if (values.Imagen) {
        $('#imagenSrc').attr('src', values.Imagen);
        $('#imagenPreview').removeClass('hidden');
    }
    if (values.Video) {
        $('#videoLink').attr('href', values.Video);
        $('#videoPreview').removeClass('hidden');
    }
    if (values.Documento) {
        $('#documentoLink').attr('href', values.Documento);
        $('#documentoPreview').removeClass('hidden');
    }

    if (!values.json) return;
    try {
        var plantillaJson = JSON.parse(values.json.trim());
        plantillaJson = Array.isArray(plantillaJson) ? plantillaJson[0] : plantillaJson;
        if (!plantillaJson || !plantillaJson.template) return;

        var $container = $('#variablesContainer');
        
        // --- CAMBIO 1: AÑADIR EL SELECTOR PARA EL NÚMERO DE DESTINO ---
        $container.append(createVariableSelector('to_phone_number', 'Número de Destino'));
        // -------------------------------------------------------------

        var components = plantillaJson.template.components || [];
        var hasDynamicFields = false;
        components.forEach(function(component) {
            if (component.type === 'body' && component.parameters && component.parameters.length > 0) {
                if (!hasDynamicFields) $container.append('<hr><label class="form-label">Variables de la Plantilla</label>'), hasDynamicFields = true;
                component.parameters.forEach(function(param, index) {
                    if (param.type === 'text') {
                        $container.append(createVariableSelector(`body_param_${index + 1}`, `Parámetro del Body ${index + 1}`));
                    }
                });
            }
        });
        $container.removeClass('hidden');
    } catch (e) {
        console.error("Error parsing JSON:", e);
        $('#variablesContainer').html('<p class="text-danger">El JSON de la plantilla es inválido.</p>').removeClass('hidden');
    }
}

/**
 * Builds the final JSON payload.
 * @param {string} plantillaName - The name of the selected template.
 * @param {object} variables - The configured variables from the UI.
 * @returns {object|null} The final JSON payload.
 */
function buildFinalPayload(plantillaName, variables) {
    if (!plantillaName) return null;
    
    var selectedRow = deData.find(row => row.keys.plantilla === plantillaName);
    
    // --- LÍNEA DE DEBUG AÑADIDA ---
    // Esta línea imprimirá en la consola del navegador los datos exactos de la fila que se encontró.
    console.log("Datos de la fila seleccionada:", selectedRow);
    // -----------------------------

    if (!selectedRow || !selectedRow.values.json) return null;

    try {
        var finalPayload = JSON.parse(selectedRow.values.json.trim());
        finalPayload = Array.isArray(finalPayload) ? finalPayload[0] : finalPayload;

        if (!finalPayload.template) return null;

        // 1. Inserta el número de destino.
        if (variables['to_phone_number']) {
            finalPayload.to = variables['to_phone_number'];
        }

        // 2. Inserta el nombre de la plantilla.
        finalPayload.template.name = plantillaName;

        var components = finalPayload.template.components || [];
        components.forEach(function(component) {
            // 3. Inserta los links de los medios.
            if (component.type === 'header' && component.parameters && component.parameters.length > 0) {
                var headerParam = component.parameters[0];
                var mediaType = headerParam.type.toLowerCase();
                var mediaColumnValue = null;

                if (mediaType === 'image' || mediaType === 'imagen') mediaColumnValue = selectedRow.values.Imagen;
                else if (mediaType === 'video') mediaColumnValue = selectedRow.values.Video;
                else if (mediaType === 'document' || mediaType === 'documento') mediaColumnValue = selectedRow.values.Documento;
                
                if (mediaColumnValue && headerParam[mediaType]) {
                    headerParam[mediaType].link = mediaColumnValue;
                }
            }
            // 4. Inserta las variables del body.
            if (component.type === 'body' && component.parameters) {
                component.parameters.forEach(function(param, index) {
                    if (param.type === 'text') {
                        var selectedValue = variables[`body_param_${index + 1}`];
                        if (selectedValue) param.text = selectedValue;
                    }
                });
            }
        });
        return finalPayload;
    } catch (e) {
        console.error("Error building final payload:", e);
        return null;
    }
}
/**
 * Saves the activity configuration.
 */
function save() {
    var plantillaSeleccionada = $('#plantillaSelect').val();
    var variablesConfiguradas = {};
    $('.variable-selector').each(function() {
        variablesConfiguradas[$(this).attr('id')] = $(this).val();
    });

    var finalPayloadObject = buildFinalPayload(plantillaSeleccionada, variablesConfiguradas);
    if (!finalPayloadObject) return;

    payload['arguments'].execute.inArguments = [{
        "contactKey": "{{Contact.Key}}"
    }, {
        "finalPayload": JSON.stringify(finalPayloadObject)
    }, {
        "plantillaSeleccionada": plantillaSeleccionada
    }, {
        "variablesConfiguradas": JSON.stringify(variablesConfiguradas)
    }];
    payload['metaData'] = payload['metaData'] || {};
    payload['metaData'].isConfigured = true;

    connection.trigger('updateActivity', payload);
}
