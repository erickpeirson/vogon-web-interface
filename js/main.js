var app = angular.module('annotationApp', ['ngResource', 'ngSanitize', 'ui.bootstrap', 'angucomplete-alt']);

app.factory('Text', function($resource) {
    return $resource('http://localhost:8000/rest/text/:id/');
});

app.factory('Appellation', function($resource) {
    return $resource('http://localhost:8000/rest/appellation/:id/');
});

app.factory('Relation', function($resource) {
    return $resource('http://localhost:8000/rest/relation/:id/');
});

app.factory('Predicate', function($resource) {
    return $resource('http://localhost:8000/rest/predicate/:id/');
});

app.factory('TemporalBounds', function($resource) {
    return $resource('http://localhost:8000/rest/temporalbounds/:id/');
});

app.factory('Concept', function($resource) {
    return $resource('http://localhost:8000/rest/concept/:id/');
});


app.factory('messageService', function($rootScope) {
    var service = {}
    service.newMessage = function(message, type) {
        var alertScope = angular.element($('#alerts')).scope();
        alertScope.closeAlert(0);
        alertScope.addAlert(message, type);
        return;
        // $rootScope.$broadcast('newMessage', message);
    }
    service.reset = function() {
        var alertScope = angular.element($('#alerts')).scope();
        alertScope.defaultAlert();
        return;
    }
    return service;
});

app.factory('selectionService', function(appellationService, messageService, predicateService, conceptService, temporalBoundsService, relationService, errors, $timeout, $compile) {
    var service = {
        ignoreWordClick: false,
        ignoreAppellationClick: false,
        expectTarget: false,
        noAppellation: false,
    };

    /**
      * Reset service to default state.
      */
    service.reset = function() {
        service.ignoreWordClick = false;
        service.ignoreAppellationClick = false;
        service.expectTarget = false;
        service.noAppellation = false;
        service.source = null;
        service.target = null;
        service.predicate = null;
        service.sourceConcept = null;
        service.targetConcept = null;
        service.predicateConcept = null;

        service.deSelectAll();
        service.deHighlightAll();
        service.clearActions();

        var alertScope = angular.element($('#alerts')).scope();
        alertScope.defaultAlert();
        alertScope.$apply();
    }

    var getStringRep = function(selector, delim) {
        var stringRep = $.map(selector, function(selem) {
            return selem.innerHTML;
        });
        return stringRep.join(delim);
    }

    var editAppellationIcon = {type: 'glyphicon-pencil', id:'edit'}

    var deleteAppellationIcon = {
        type: 'glyphicon-remove',
        id: 'remove',
        tooltip: 'Delete this appellation.',
        action: function(e) {
            var data = {
                id: service.getCurrentAppellationID()
            }
            appellationService.deleteAppellation(data);
        }
    }

    var createAppellationIcon = {
        type:'glyphicon-plus',
        id:'create',
        action: function(e) {
            var stringRep = getStringRep(service.selected, ' ');
            var tokenIds = $.map(service.selected, function(selem) {
                return selem.id;
            });
            var text = {
                stringRep: stringRep,
                tokenIds: tokenIds.join(',')
            };

            // TODO: simplify this -vv-
            var settings = {
                title: 'What is this?',
                instructions: 'Please select the concept (e.g. person, place, institution, organism) to which your text selection refers.',
                text: text,
                pos: 'noun',
                placeholder: 'Search for a concept',
            }
            angular.element($('#modalConcept')).scope().open(settings, function(modalData) {
                var annotationScope = angular.element(document.getElementById('annotations')).scope();

                try {
                    var concept = modalData.concept.originalObject;

                    var data = {    // Appellation creation payload.
                        interpretation: concept.id,
                        stringRep: modalData.text.stringRep,
                        tokenIds: modalData.text.tokenIds,
                        occursIn: 1,
                        createdBy: 1,
                        inSession: 1
                    }
                    appellationService
                        .createAppellation(data)
                        .then(function(a) {
                            service.source = a;
                        })
                        .catch(function() {
                            service.reset();
                            errors.catch("Could not create appellation!");
                        });
                }
                catch(error) {
                    service.reset();
                    errors.catch("Could not create appellation!");
                }

            });
        }
    }

    var createRelationIcon = {
        type: 'glyphicon-arrow-right',
        id: 'relation',
        action: function(e) {
            service.ignoreWordClick = true;
            service.expectTarget = true;
            service.clearActions();
            var alertScope = angular.element($('#alerts')).scope();
            alertScope.newMessage('Source: <span class="quotedText">' + service.sourceConcept.label + '</span>. Select a target appellation.');
            alertScope.$apply();
        }
    }

    /**
      * Used to finalize a text selection.      glyphicon-calendar
      */
    var createPredicateIcon = {
        type: 'glyphicon-ok',
        id: 'predicate',
        action: function(e) {
            var stringRep = getStringRep(service.selected, ' ');
            var tokenIds = $.map(service.selected, function(selem) {
                return selem.id;
            });
            var text = {
                stringRep: stringRep,
                tokenIds: tokenIds.join(',')
            };
            var settings = {
                title: 'How are these concepts related?',
                instructions: 'Select a predicate that best characterizes the relationship between the two concepts that you selected, based on your interpretation of the text. Most predicates are directional, so your first selection will be the subject of the relation and your second selection will be the object of the relation.',
                text: text,
                pos: 'verb',
                placeholder: 'Search for a predicate concept',
            }
            angular.element($('#modalConcept')).scope().open(settings, function (modalData) {
                // var annotationScope = angular.element(document.getElementById('annotations')).scope();

                try {
                    var concept = modalData.concept.originalObject;

                    var data = {    // Predicate creation payload.
                        interpretation: concept.id,
                        stringRep: modalData.text.stringRep,
                        tokenIds: modalData.text.tokenIds,
                        occursIn: 1,
                        createdBy: 1,
                        inSession: 1,
                        asPredicate: true,
                    }

                    predicateService
                        .createPredicate(data)
                        .then(function(predicate) {
                            service.predicate = predicate;
                            conceptService
                                .getConcept(service.predicate.interpretation)
                                .then(function(c) {
                                    service.predicateConcept = c;
                                    var tBsettings = {
                                        title: 'When did this relationship occur?',
                                        instructions: 'Select the date (to the greatest degree of precision) on which this relationship commenced or terminated, or the date on which you know the relationship to have existed. Do not provide any more information than what is substantiated by the text.',
                                        contextData: {
                                            sourceConcept: service.sourceConcept,
                                            predicateConcept: service.predicateConcept,
                                            targetConcept: service.targetConcept,
                                        },
                                    }
                                    angular.element($('#modalTemporalBounds')).scope().open(tBsettings, function(modalData) {
                                        var data = {};
                                        if (modalData.started) {
                                            data.start = [];
                                            if (modalData.started.year) data.start.push(modalData.started.year);
                                            if (modalData.started.month) data.start.push(modalData.started.month);
                                            if (modalData.started.day) data.start.push(modalData.started.day);
                                        }
                                        if (modalData.ended) {
                                            data.end = [];
                                            if (modalData.ended.year) data.end.push(modalData.ended.year);
                                            if (modalData.ended.month) data.end.push(modalData.ended.month);
                                            if (modalData.ended.day) data.end.push(modalData.ended.day);
                                        }
                                        if (modalData.occurred) {
                                            data.occur = [];
                                            if (modalData.occurred.year) data.occur.push(modalData.occurred.year);
                                            if (modalData.occurred.month) data.occur.push(modalData.occurred.month);
                                            if (modalData.occurred.day) data.occur.push(modalData.occurred.day);
                                        }

                                        var temporalBounds = temporalBoundsService.createTemporalBounds(data).then(function(t) {
                                            var relationData = {
                                                source: service.source.id,
                                                predicate: service.predicate.id,
                                                object: service.target.id,
                                                bounds: t.id,
                                                occursIn: 1,
                                                createdBy: 1,
                                                inSession: 1,
                                            }

                                            // Last step: create the relation!
                                            relationService
                                                .createRelation(relationData)
                                                .then(function(r) {
                                                    messageService.newMessage('Created relation: <span class="quotedText">' + service.sourceConcept.label + ' - ' + service.predicateConcept.label + ' - ' + service.targetConcept.label + '</span>.', 'success');
                                                    $timeout(service.reset, 3000);
                                                });
                                        });

                                    });

                                });

                        })
                        .catch(function() {
                            service.reset();
                            errors.catch("Could not create predicate!");
                        });
                }
                catch(error) {
                    service.reset();
                    errors.catch("Could not create predicate!");
                }
            });
        }
    }

    service.select = function(selector) {
        if (service.selected) service.selected = service.selected.add(selector);
        else service.selected = selector;
        selector.addClass('selected');
    }

    service.highlight = function(selector) {
        selector.addClass('highlight');
    }

    service.deHighlight = function(selector) {
        selector.removeClass('highlight');
    }

    service.deHighlightAll = function() {
        $('.highlight').removeClass('highlight');
    }

    service.select_by = function(selection_string) {
        service.select($(selection_string));
    }

    service.isSelected = function(elem) {
        return service.selected.indexOf(elem) > -1;
    }

    service.deSelect = function(selector) {
        selector.removeClass('selected');
        selector.each(function(elem) {
            var index = service.selected.indexOf(elem);
            if (index > -1) service.selected.splice(index, 1);
        });
    }

    service.deSelectAll = function() {
        if (service.selected) service.selected.removeClass('selected');
        service.selected = null;
    }

    service.getCurrentAppellationID = function() {
        return service.selected.attr("appellation");
    }

    service.selectIntermediate = function(start, end) {
        // Select words between start and end. If start, end, or any
        // intermediate words are appellations, abort and clear all selections.
        var toSelect = start.nextUntil(end).add(start).add(end);

        if (toSelect.is('.appellation')) {  // Selection crosses an appellation.
            return false;
        }
        service.select(toSelect);   // Otherwise, select everything.
        return true;
    }

    service.clickSelectAppellation = function(target) {
        if (service.ignoreAppellationClick) return

        var targetElement, targetSelector, icons;
        targetSelector = $('[appellation=' + target.attr("appellation") + ']');
        targetElement = targetSelector.last();
        icons = [editAppellationIcon, deleteAppellationIcon, createRelationIcon];

        // Create a new relation.
        if (service.expectTarget) {
            service.relationSource = service.selected;
            service.relationTarget = targetSelector;
            service.expectTarget = false;
            service.ignoreWordClick = false;
            service.ignoreAppellationClick = true;
            service.noAppellation = true;

            service.highlight(service.relationSource);

            // Acquire the target appellation and its interpretation.
            appellationService
                .getAppellation(target.attr("appellation"))
                .then(function(a) {
                    service.target = a;
                    conceptService
                        .getConcept(service.target.interpretation)
                        .then(function(c) {
                            service.targetConcept = c;
                            messageService.newMessage('Select the word or passage that best describes the relationship between <span class="quotedText">' + service.sourceConcept.label + '</span> and <span class="quotedText">' + service.targetConcept.label + '</span>.');
                            service.deSelectAll();
                            service.highlight(service.relationTarget);
                        });
                });
        } else {
            appellationService
                .getAppellation(target.attr("appellation"))
                .then(function(a) {
                    service.source = a;
                    conceptService
                        .getConcept(service.source.interpretation)
                        .then(function(c) {
                            messageService.newMessage('You selected <span class="quotedText">' + c.label + '</span>.');
                            service.sourceConcept = c;
                            return c;
                        });
                });
            service.displayActions(targetElement, icons);
        }
        service.deSelectAll();
        service.select(target);
    }

    service.clickSelectMultiple = function(target) {
        // User can select multiple non-appellation words by holding
        //  the shift key.
        var first = service.selected.first();
        var last = service.selected.last();
        var index_target = $('word').index(target);
        var index_first = $('word').index(first);
        var index_last = $('word').index(last);
        var inter;

        // Select words between the new target word and either the
        //  start or end of the current selection.
        if (index_target < index_first) {       // Target is earlier.
            inter = service.selectIntermediate(target, first);
            targetElement = last;
        } else if (index_last < index_target) {     // Target is later.
            inter = service.selectIntermediate(last, target);
            targetElement = target;
        }

        // If multi-selection was aborted, the `targetElement` (where the icons)
        //  should appear should be the last element clicked (`target`).
        if (!inter){
            targetElement = target;
            service.deSelectAll();  // ...and we start a new selection.
        }

        service.select(target);
        service.displayWordActions(targetElement);
    }

    service.clickSelectWord = function(target) {
        if (service.ignoreWordClick) return

        targetElement = target;
        service.deSelectAll();  // New selection.
        service.select(target);
        service.displayWordActions(targetElement);

        // TODO: figure out why this is necessary.
        var alertScope = angular.element($('#alerts')).scope();
        alertScope.newMessage('Hold the shift key and click on another word to select a series of words.');
        alertScope.$apply();
        return;
    }

    service.displayWordActions = function(targetElement) {
        if (service.noAppellation) {
            icons = [createPredicateIcon];
        } else {
            icons = [createAppellationIcon];
        }
        service.displayActions(targetElement, icons);
        return;
    }

    /**
     * Display a set of icons next to DOM element.
     */
    service.displayActions = function(element, icons) {
        /**
         * Get the appropriate offset for icons, based on the position of
         * element.
         */
        var calculatePosition = function() {
            var position = element.position();
            position.left += element.width();
            position.top -= 5;
            return position;
        }

        service.clearActions();

        var parent = $('<div>', {
            class: 'actionIcons panel',
        });
        icons.forEach(function(icon) {
            var elem = $("<button>", {
                class: "btn btn-primary btn-xs",
            });
            var iData = {
                class: "glyphicon " + icon.type,
                id:icon.id,
            };
            elem.append($("<span>", iData).on('click', icon.action));
            parent.append(elem);
        });

        $('body').append(parent);
        parent.offset(calculatePosition());


        // Icons should track the element to which they are attached.
        $(window).resize(function() {
            parent.offset(calculatePosition());
        });
    }

    service.clearActions = function() {
        $('.actionIcons').remove();  // Remove any displayed icons.
    }

    return service;

});

app.factory('predicateService', ['$rootScope', 'Predicate', function($rootScope, Predicate) {
    return {
        createPredicate: function(data) {
            var predicate = new Predicate(data);
            return predicate.$save().then(function(a, rHeaders) {
                $rootScope.$broadcast('newPredicate', a);
                return a;
            });
        },
    };
}]);

app.factory('relationService', ['$rootScope', 'Relation', function($rootScope, Relation) {
    return {
        createRelation: function(data) {
            var relation = new Relation(data);
            return relation.$save().then(function(r, rHeaders) {
                $rootScope.$broadcast('newRelation', r);
                return r;
            });
        },
    };
}]);

app.factory('temporalBoundsService', ['$rootScope', 'TemporalBounds', function($rootScope, TemporalBounds) {
    return {
        createTemporalBounds: function(data) {
            var temporalbounds = new TemporalBounds(data);
            return temporalbounds.$save().then(function(t, rHeaders) {
                $rootScope.$broadcast('newTemporalBounds', t);
                return t;
            });
        },
    };
}]);

app.factory('conceptService', ['$rootScope', 'Concept', function($rootScope, Concept) {
    return {
        getConcept: function(id) {
            return Concept.get({id:id}, function(c) {
                // Hmmm....
            }).$promise.then(function(c){
                return c;
            });
        }
    };
}]);

app.factory('appellationService', ['$rootScope', 'Appellation', function($rootScope, Appellation) {
    return {
        getAppellations: function(callback) {
            service = this;
            return Appellation.query(function(appellations) {
                service.appellations = appellations;
                callback(appellations);
            });
        },
        getAppellation: function(appId) {  // Retrieve by ID.
            return Appellation.get({id: appId}, function(c) {
                // Hmmm...
            }).$promise.then(function(a) {
                return a;
            });
            // var found;
            // service.appellations.forEach(function(appellation) {
            //     if (String(appellation.id) == String(appId)) found = appellation;
            // });
            // return found;    // null if not found.
        },
        getAppellationIndex: function(appId) {  // Retrieve by ID.
            var foundIndex;
            service.appellations.forEach(function(appellation, index) {
                if (String(appellation.id) == String(appId)) foundIndex = index;
            });
            return foundIndex;
        },
        createAppellation: function(data) {
            var appellation = new Appellation(data);
            return appellation.$save().then(function(a, rHeaders) {
                service.appellations.push(a);
                $rootScope.$broadcast('newAppellation', a);
                return a;
            });
        },
        deleteAppellation: function(data) {
            var app = service.getAppellation(data.id);
            var appData = {
                id: app.id,
                tokenIds: app.tokenIds,
                stringRep: app.stringRep
            }
            return Appellation.delete(data).then(function() {
                service.getAppellations(function() { null; });  // Refresh.
                $rootScope.$broadcast('deleteAppellation', appData);
                return appData;
            });
        }
    };
}]);

app.controller('ActionsController', function($scope, $position) {

});

app.controller('AlertController', function ($scope, $sce) {
    $scope.defaultAlert = function() {
        $scope.alerts = [{message: 'Click on a word to get started.'}];
    };
    $scope.defaultAlert();

    $scope.clearAlerts = function() {
        $scope.alerts = [];
    }

    $scope.addAlert = function(message, type) {
        $scope.alerts.push({type: type, message: $sce.trustAsHtml(message)});
    };

    $scope.closeAlert = function(index) {
        $scope.alerts.splice(index, 1);
    };

    $scope.newMessage = function(msg) {
        $scope.closeAlert(0);
        $scope.addAlert(msg);
    };
});

// app.controller('InstructionController', function($scope, $sce) {
//     $scope.message = 'current !! message';
//
//     $scope.setMessage = function(message) {
//         $scope.message = message;
//         $scope.$apply();
//     }
//
//     $scope.$on('newMessage', function(event, msg) {
//         $scope.setMessage($sce.trustAsHtml(msg));
//     });
// });

app.controller('ActionsController', function ($scope) {
    $scope.actions = [
        { icon: 'glyphicon-plus' },
        { icon: 'glyphicon-pencil' }
    ];
    $scope.isCollapsed = false;
});

app.controller('AppellationsController', ['$scope', 'appellationService', 'selectionService', function($scope, appellationService, selectionService) {

    appellationService.getAppellations(function(appellations) {
        $scope.appellations = appellations;
    });

    // Add a new appellation to the model.
    $scope.$on('newAppellation', function(event, a) {
        $scope.appellations.push(a);
    });

    // Remove a deleted appellation from the model.
    $scope.$on('deleteAppellation', function(event, a) {
        var index;  // Get index of appellation by ID.
        $scope.appellations.forEach(function(appellation, i) {
            if (String(appellation.id) == String(a.id)) index = i;
        });
        if (index) $scope.appellations.splice(index);
    });

    $scope.appellationClick = function(appId) {
        var appElem = $('[appellation=' + appId + ']');

        selectionService.clickSelectAppellation(appElem);
    }

}]);

app.controller('ModalTemporalBoundsControl', function($scope, $modal, $log) {
    $scope.animationsEnabled = true;

    $scope.open = function(settings, callback) {
        settings.dateOptions = {

        };

        var modalInstance = $modal.open({
            animation: $scope.animationsEnabled,
            templateUrl: 'modalTemporalBounds.html',
            controller: 'ModalInstanceController',
            resolve: {
                settings: function() {
                    return settings;
                },
            }
        });

        modalInstance.result.then(callback, function() {
            $log.info('Modal dismissed at: ' + new Date());
        });
    }
});

app.controller('ModalConceptControl', function ($scope, $modal, $log) {
    $scope.animationsEnabled = true;
    $scope.open = function (settings, callback) {
        var modalInstance = $modal.open({
            animation: $scope.animationsEnabled,
            templateUrl: 'modalConcept.html',
            controller: 'ModalInstanceController',
            resolve: {
                settings: function() {
                    return settings;
                },
            }
        });

        modalInstance.result.then(callback, function () {
            $log.info('Modal dismissed at: ' + new Date());
        });
    };

    $scope.toggleAnimation = function () {
        $scope.animationsEnabled = !$scope.animationsEnabled;
    };
});

app.controller('ModalInstanceController', function ($scope, $modalInstance, settings) {
    $scope.text = settings.text;
    $scope.pos = settings.pos;
    $scope.title = settings.title;
    $scope.instructions = settings.instructions;
    $scope.placeholder = settings.placeholder;
    $scope.contextData = settings.contextData;
    $scope.okDisabled = true;

    $scope.selectConcept = function(c) {
        $scope.concept = c;
        $scope.okDisabled = false;
    };

    $scope.ok = function () {
        $modalInstance.close($scope);
    };

    $scope.cancel = function () {
        $modalInstance.dismiss('cancel');
    };
});

app.controller('TextController', function($scope, $sce, Text) {
    var text = Text.get({id:1}, function() {    // TODO: not hardcoded!!
        $scope.textContent = $sce.trustAsHtml(text.tokenizedContent);
    });


});

app.directive('escapeKey', function (selectionService) {
    return function (scope, element, attrs) {
        element.bind("keydown keypress", function (event) {
            if(event.which === 27) {
                console.log('asdfasdfasdfasdf');
                event.preventDefault();
                selectionService.reset();
            }
        });
    };
});

app.directive('ngEnter', function($document) {
    return {
        scope: {
            ngEnter: "&"
        },
        link: function(scope, element, attrs) {
            var enterWatcher = function(event) {
                if (event.which === 13) {
                    scope.ngEnter();
                    scope.$apply();
                    event.preventDefault();
                    $document.unbind("keydown keypress", enterWatcher);
                }
            };
            $document.bind("keydown keypress", enterWatcher);
        }
    }
});


app.directive('bindText', function($rootScope, appellationService, selectionService, Appellation) {
    var bindText = function() {
        $('word').on('click', function(e) {
            var target = $(e.target);

            if (target.is('.appellation')) {
                selectionService.clickSelectAppellation(target);
            } else {
                if (e.shiftKey) {
                    selectionService.clickSelectMultiple(target);
                } else {
                    // User has clicked on a non-appellation word.
                    selectionService.clickSelectWord(target);
                }
            }
        });
    }

    var highlight = function(a) {
        a.tokenIds.split(',').forEach(function(wordId) {
            var word = $('word#'+wordId);
            if (word.length > 0) {
                word.addClass("appellation");
                word.attr("appellation", a.id);
            }
        });
    }

    var unHighlight = function(a) {
        a.tokenIds.split(',').forEach(function(wordId) {
            var word = $('word#' + wordId);
            if (word.length > 0) {
                word.removeClass("appellation");
                word.attr("appellation", null);
            }
        });
    };

    return function(scope, element, attrs) {
        scope.$watch("textContent", function(value) {
            bindText();     // TODO: make more angular.

            // Highlight existing appellations.
            appellationService.getAppellations(function(appellations) {
                appellations.forEach(highlight);
            });
        });

        $rootScope.$on('newAppellation', function(event, a) {
            highlight(a);   // Highlight word(s).
            selectionService.deSelectAll();
            selectionService.clearActions();
        });

        $rootScope.$on('newPredicate', function(event, a) {
            selectionService.deSelectAll();
            selectionService.clearActions();
        });

        $rootScope.$on('deleteAppellation', function(event, a) {
            unHighlight(a);
            selectionService.deSelectAll();
            selectionService.clearActions();
        });
    }
});

app.factory("errors", function($rootScope, messageService, $timeout){
    return {
        catch: function(message){
            // return function(reason) {
            messageService.newMessage(message, 'danger');
            $timeout(messageService.reset, 3000);
            // var alertScope = angular.element($('#alerts')).scope();
            // alertScope.addAlert('danger', message);
            return;
            // };
        }
    };
});

$(document).ready(function() {
    var s = $(".sticky");
    var pos = s.position();
    $(window).scroll(function() {
        var windowpos = $(window).scrollTop();
        if (windowpos >= pos.top) s.addClass("stick");
        else s.removeClass("stick");
    });

});
