'use strict';

// Postmonger connection setup
var connection = new Postmonger.Session();

// Global objects
var payload = {};
var deData = []; // To store all data from the DE
var journeySchemaFields = []; // *** NUEVO: Para guardar los campos de la DE de entrada del Journey ***

// Waits for the document to be ready, then calls onRender
$(window).ready(onRender);

// Subscribes to Journey Builder events
connection.on('initActivity', initialize);
connection.on('clickedNext', save);

/**
 * The client-side code that executes when the Custom Activity editor is rendered.
 */
function onRender() {
    connection.trigger('ready');
    fetchDataFromDE();

    $('#plantillaSelect').on('change', function() {
        var selectedPlantillaName = $(this).val();
        updateUIForSelectedPlantilla(selectedPlantillaName);
    });

    // *** NUEVO: Evento para manejar la selección de un campo del Journey ***
    // Usa delegación de eventos para que funcione en elementos creados dinámicamente.
    $(document).on('change', '.journey-field-selector', function() {
        var $this = $(this);
        var selectedValue = $this.val();
        var targetInputId = $this.data('target-input');
        
        if (selectedValue) {
            // Inserta el campo en el input de texto correspondiente
            var fullFieldSyntax = '{{' + selectedValue + '}}';
            $(targetInputId).val(fullFieldSyntax);
            
            // Resetea el selector a su estado inicial
            $this.val('');
        }
    });
}

/**
 * Fetches all rows from the "TEST" Data Extension via our backend endpoint.
 */
function fetchDataFromDE() {
    var dataUrl = "getData.php"; 

    $.ajax({
        url: dataUrl,
        method: 'GET',
        success: function(data) {
            deData = data;
            populateDropdown(deData);
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
 * Populates the dropdown with 'Plantilla' names.
 * @param {Array} data - Array of objects from the DE.
 */
function populateDropdown(data) {
    var $select = $('#plantillaSelect');
    $select.empty().append('<option value="">-- Seleccione una plantilla --</option>');
    data.forEach(function(row) {
        var plantillaName = row.keys.plantilla;
        
        if (plantillaName) {
            $select.append($('<option>', {
                value: plantillaName,
                text: plantillaName
            }));
        }
    });
}

/**
 * Updates the UI based on the selected plantilla.
 */
function updateUIForSelectedPlantilla(plantillaName) {
    $('#variablesContainer, #mediaContainer .media-preview, #botDisplay').addClass('hidden');
    $('#variablesContainer').empty();
    
    if (!plantillaName) return;

    var selectedRow = deData.find(row => row.keys.plantilla === plantillaName);
    if (!selectedRow) return;

    var values = selectedRow.values;

    if (values.bot) {
        $('#botName').text(values.bot);
        $('#botDisplay').removeClass('hidden');
    }
    
    var numVariables = parseInt(values.variables, 10);
    if (!isNaN(numVariables) && numVariables > 0) {
        var $container = $('#variablesContainer');
        $container.append('<label class="form-label">Variables de la Plantilla</label>');
        for (let i = 1; i <= numVariables; i++) {
            // *** MODIFICADO: Ahora creamos un grupo de input con un campo de texto y un selector ***
            var inputId = `variable_${i}`;
            var inputGroupHtml = `
                <div class="input-group mb-2">
                    <input type="text" class="form-control variable-input" id="${inputId}" 
                           placeholder="Variable ${i} o seleccione un campo -->">
                    <select class="form-select journey-field-selector" data-target-input="#${inputId}">
                        <option value="">-- Insertar Campo del Journey --</option>
                    </select>
                </div>`;
            var $inputGroup = $(inputGroupHtml);

            // Poblar el selector con los campos del esquema del Journey
            var $select = $inputGroup.find('.journey-field-selector');
            journeySchemaFields.forEach(function(field) {
                $select.append($('<option>', {
                    value: field.key,
                    text: field.name
                }));
            });

            $container.append($inputGroup);
        }
        $container.removeClass('hidden');
    }

    if (values.video) {
        $('#videoLink').attr('href', values.video);
        $('#videoPreview').removeClass('hidden');
    }
    if (values.imagen) {
        $('#imagenSrc').attr('src', values.imagen);
        $('#imagenPreview').removeClass('hidden');
    }
    if (values.documento) {
        $('#documentoLink').attr('href', values.documento);
        $('#documentoPreview').removeClass('hidden');
    }
}


/**
 * Initializes the activity with previously saved data.
 */
function initialize(data) {
    if (data) {
        payload = data;
    }

    // *** NUEVO: Capturamos el esquema de la DE de entrada del Journey ***
    if (data && data.schema) {
        data.schema.forEach(function(field) {
            // Solo agregamos campos que no sean de sistema (opcional, pero buena práctica)
            if (!field.key.startsWith('Event.APIEvent')) {
                 journeySchemaFields.push({
                    name: field.name,
                    key: field.key
                });
            }
        });
    }

    var inArguments = payload['arguments'].execute.inArguments || [];
    var args = {};
    inArguments.forEach(arg => {
        for (let key in arg) {
            args[key] = arg[key];
        }
    });

    var checkDataLoaded = setInterval(function() {
        if (deData.length > 0) {
            clearInterval(checkDataLoaded);

            if (args.plantillaSeleccionada) {
                $('#plantillaSelect').val(args.plantillaSeleccionada).trigger('change');
                
                setTimeout(function() {
                    if (args.variablesConfiguradas) {
                        try {
                            var savedVars = JSON.parse(args.variablesConfiguradas);
                            $('.variable-input').each(function() {
                                var varName = $(this).attr('id');
                                if (savedVars[varName]) {
                                    $(this).val(savedVars[varName]);
                                }
                            });
                        } catch(e) { console.error("Could not parse saved variables", e); }
                    }
                }, 100);
            }
        }
    }, 100);
}

/**
 * Saves the current configuration of the activity.
 */
function save() {
    var plantillaSeleccionada = $('#plantillaSelect').val();
    var variablesConfiguradas = {};
    
    $('.variable-input').each(function() {
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
