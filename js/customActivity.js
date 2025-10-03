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
    // Signal to Journey Builder that the UI is ready
    connection.trigger('ready');

    // Attach event listener for the template dropdown
    $('#plantillaSelect').on('change', function() {
        var selectedPlantillaName = $(this).val();
        updateUIForSelectedPlantilla(selectedPlantillaName);
    });
}

/**
 * This function is called when Journey Builder initializes the activity.
 * It starts the configuration process by requesting the journey schema.
 * @param {object} data - The activity's saved configuration.
 */
function initialize(data) {
    if (data) {
        payload = data;
    }
    // Request the journey schema. The response will be handled by the 'requestedSchema' listener.
    connection.trigger('requestSchema');
}

/**
 * Handles the schema response from Journey Builder.
 * After processing the schema, it proceeds to fetch data from the Data Extension.
 * @param {object} schemaData - The schema object returned by Journey Builder.
 */
function handleSchema(schemaData) {
    if (schemaData && schemaData.schema) {
        journeySchemaFields = []; // Clear any previous data
        schemaData.schema.forEach(function(field) {
            // Filter out internal SFMC event fields to show only relevant journey data
            if (field.key && !field.key.startsWith('Event.APIEvent')) {
                journeySchemaFields.push({
                    name: field.name,
                    key: field.key
                });
            }
        });
    }
    // Now that we have the schema, we can safely fetch the DE data to build the UI
    fetchDataFromDE();
}

/**
 * Fetches template data from the server and, upon success, restores the saved UI state.
 */
function fetchDataFromDE() {
    var dataUrl = "getData.php"; // Asegúrate que esta URL sea correcta
    $.ajax({
        url: dataUrl,
        method: 'GET',
        success: function(data) {
            deData = data;
            populateDropdown(deData);
            
            // With all data loaded, restore the UI to its saved state
            restoreUiState();

            // Hide the loader and show the configuration form
            $('#loader').addClass('hidden');
            $('#config-form').removeClass('hidden');
        },
        error: function(xhr, status, error) {
            console.error("Error fetching DE data:", status, xhr.responseText);
            $('#loader').html('<p class="text-danger">Error al cargar las plantillas. Verifique la consola.</p>');
        }
    });
}

/**
 * Restores the UI to its previously saved configuration using the global payload.
 */
function restoreUiState() {
    var inArguments = (payload['arguments'] && payload['arguments'].execute && payload['arguments'].execute.inArguments) ? payload['arguments'].execute.inArguments : [];
    var args = {};

    inArguments.forEach(arg => {
        for (let key in arg) {
            args[key] = arg[key];
        }
    });

    if (args.plantillaSeleccionada) {
        $('#plantillaSelect').val(args.plantillaSeleccionada);
        updateUIForSelectedPlantilla(args.plantillaSeleccionada);

        if (args.variablesConfiguradas) {
            try {
                var savedVars = JSON.parse(args.variablesConfiguradas);
                $('.variable-selector').each(function() {
                    var varId = $(this).attr('id');
                    if (savedVars[varId]) {
                        $(this).val(savedVars[varId]);
                    }
                });
            } catch (e) {
                console.error("Could not parse saved variables", e);
            }
        }
    }
}

/**
 * Populates the main template dropdown with data from the Data Extension.
 * @param {Array} data - The array of template data.
 */
function populateDropdown(data) {
    var $select = $('#plantillaSelect');
    $select.empty().append('<option value="">-- Seleccione una plantilla --</option>');
    data.forEach(function(row) {
        var plantillaName = row.keys.plantilla;
        if (plantillaName) {
            $select.append($('<option>', { value: plantillaName, text: plantillaName }));
        }
    });
}

/**
 * Creates and returns the HTML for a variable selector (dropdown),
 * populated with fields from the journey schema.
 * @param {string} id - The unique ID for the <select> element.
 * @param {string} label - The label to be displayed above the dropdown.
 * @returns {jQuery} A jQuery object representing the dropdown wrapper.
 */
function createVariableSelector(id, label) {
    var selectHtml = `
        <div class="mb-2">
            <label for="${id}" class="form-label small">${label}</label>
            <select class="form-select variable-selector" id="${id}">
                <option value="">-- Seleccione un Campo del Journey --</option>
            </select>
        </div>`;
    
    var $selectWrapper = $(selectHtml);
    var $select = $selectWrapper.find('.variable-selector');
    
    journeySchemaFields.forEach(function(field) {
        $select.append($('<option>', {
            value: '{{' + field.key + '}}',
            text: field.name
        }));
    });

    return $selectWrapper;
}

/**
 * Updates the UI based on the selected template.
 * This new version reads a JSON structure to dynamically build the fields.
 * @param {string} plantillaName - The name of the selected template.
 */
function updateUIForSelectedPlantilla(plantillaName) {
    $('#variablesContainer, #mediaContainer .media-preview, #botDisplay').addClass('hidden');
    $('#variablesContainer').empty();
    
    if (!plantillaName) return;

    var selectedRow = deData.find(row => row.keys.plantilla === plantillaName);
    if (!selectedRow) {
        console.error("No se encontraron datos para la plantilla:", plantillaName);
        return;
    }

    var values = selectedRow.values;

    if (values.bot) {
        $('#botName').text(values.bot);
        $('#botDisplay').removeClass('hidden');
    }

    if (!values.JSON) {
        console.warn("La plantilla seleccionada no tiene un campo JSON definido en la Data Extension.");
        return;
    }

    try {
        var plantillaJson = JSON.parse(values.JSON);
        var components = plantillaJson.template.components || [];
        var $container = $('#variablesContainer');
        var hasDynamicFields = false;

        components.forEach(function(component) {
            if (component.type === 'header' && component.parameters && component.parameters.length > 0) {
                var headerParam = component.parameters[0];
                var mediaType = headerParam.type.toLowerCase();
                
                if (headerParam[mediaType] && headerParam[mediaType].link) {
                    var link = headerParam[mediaType].link;
                    if (mediaType === 'video') {
                        $('#videoLink').attr('href', link);
                        $('#videoPreview').removeClass('hidden');
                    } else if (mediaType === 'image' || mediaType === 'imagen') {
                        $('#imagenSrc').attr('src', link);
                        $('#imagenPreview').removeClass('hidden');
                    } else if (mediaType === 'document' || mediaType === 'documento') {
                        $('#documentoLink').attr('href', link);
                        $('#documentoPreview').removeClass('hidden');
                    }
                }
            }

            if (component.type === 'body' && component.parameters && component.parameters.length > 0) {
                if (!hasDynamicFields) {
                    $container.append('<label class="form-label">Variables de la Plantilla</label>');
                    hasDynamicFields = true;
                }
                
                component.parameters.forEach(function(param, index) {
                    if (param.type === 'text') {
                        var paramIndex = index + 1;
                        var selectId = `body_param_${paramIndex}`;
                        var label = `Parámetro del Body ${paramIndex}`;
                        
                        var $select = createVariableSelector(selectId, label);
                        $container.append($select);
                    }
                });
            }
        });

        if (hasDynamicFields) {
            $container.removeClass('hidden');
        }

    } catch (e) {
        console.error("Error al parsear el JSON de la plantilla:", e);
        $('#variablesContainer').html('<p class="text-danger">El JSON de la plantilla es inválido. Revíselo en la Data Extension.</p>').removeClass('hidden');
    }
}

/**
 * This function is called when the user clicks "Next" or "Done" in the Journey Builder UI.
 * It saves the current configuration of the activity.
 */
function save() {
    var plantillaSeleccionada = $('#plantillaSelect').val();
    var variablesConfiguradas = {};
    
    $('.variable-selector').each(function() {
        var id = $(this).attr('id');
        var value = $(this).val();
        variablesConfiguradas[id] = value;
    });

    payload['arguments'].execute.inArguments = [
        { "contactKey": "{{Contact.Key}}" },
        { "plantillaSeleccionada": plantillaSeleccionada },
        { "variablesConfiguradas": JSON.stringify(variablesConfiguradas) }
    ];
    
    payload['metaData'] = payload['metaData'] || {};
    payload['metaData'].isConfigured = true;

    connection.trigger('updateActivity', payload);
}
