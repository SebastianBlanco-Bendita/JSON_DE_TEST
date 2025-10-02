'use strict';

// Postmonger connection setup
var connection = new Postmonger.Session();

// Global objects
var payload = {};
var deData = []; 
var journeySchemaFields = []; 

$(window).ready(onRender);

connection.on('initActivity', initialize);
connection.on('clickedNext', save);

function onRender() {
    connection.trigger('ready');
    fetchDataFromDE();

    $('#plantillaSelect').on('change', function() {
        var selectedPlantillaName = $(this).val();
        updateUIForSelectedPlantilla(selectedPlantillaName);
    });
}

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
            var selectId = `variable_${i}`;
            var selectHtml = `
                <div class="mb-2">
                    <label for="${selectId}" class="form-label small">Variable ${i}</label>
                    <select class="form-select variable-selector" id="${selectId}">
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
            $container.append($selectWrapper);
        }
        $container.removeClass('hidden');
    }

    // *** MEJORA: Solo mostrar medios si el valor es una URL válida ***
    const isUrl = (str) => str && (str.startsWith('http') || str.startsWith('/'));

    if (isUrl(values.video)) {
        $('#videoLink').attr('href', values.video);
        $('#videoPreview').removeClass('hidden');
    }
    if (isUrl(values.imagen)) {
        $('#imagenSrc').attr('src', values.imagen);
        $('#imagenPreview').removeClass('hidden');
    }
    if (isUrl(values.documento)) {
        $('#documentoLink').attr('href', values.documento);
        $('#documentoPreview').removeClass('hidden');
    }
}

function initialize(data) {
    if (data) { payload = data; }

    if (data && data.schema && typeof data.schema === 'object') {
        const fields = Object.values(data.schema)[0]; 
        if (Array.isArray(fields)) {
            fields.forEach(function(field) {
                if (!field.key.startsWith('Event.APIEvent')) {
                     journeySchemaFields.push({ name: field.name, key: field.key });
                }
            });
        }
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
                            $('.variable-selector').each(function() {
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
