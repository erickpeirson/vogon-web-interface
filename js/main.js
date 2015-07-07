


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

app.factory('messageService', function($rootScope) {
    var service = {}
    service.newMessage = function(message) {
        console.log(message);
        $rootScope.$broadcast('newMessage', message);
    }
    return service;
});

app.factory('selectionService', function(appellationService, messageService) {
    var service = {
        ignoreWordClick: false,
        ignoreAppellationClick: false,
        expectTarget: false,
    };

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
            angular.element($('#modalConcept')).scope().open(text);
        }
    }

    var createRelationIcon = {
        type: 'glyphicon-arrow-right',
        id: 'relation',
        action: function(e) {
            service.ignoreWordClick = true;
            service.expectTarget = true;
            messageService.newMessage('create a new relation!');
        }
    }

    service.select = function(selector) {
        if (service.selected) service.selected = service.selected.add(selector);
        else service.selected = selector;
        selector.addClass('selected');
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

        var targetElement, icons;
        target = $('[appellation=' + target.attr("appellation") + ']');
        targetElement = target.last();
        icons = [editAppellationIcon, deleteAppellationIcon, createRelationIcon];

        if (service.expectTarget) {
            service.relationSource = service.selected;
            service.relationTarget = target;

            var sourceRep = getStringRep(service.relationSource, ' ');
            var targetRep = getStringRep(service.relationTarget, ' ');
            messageService.newMessage('Select the word or passage that best describes the relationship between <span class="quotedText">' + sourceRep + '</span> and <span class="quotedText">' + targetRep + '</span>');
        }

        service.deSelectAll();
        service.select(target);
        service.displayActions(targetElement, icons);
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

        icons = [createAppellationIcon];
        service.select(target);
        service.displayActions(targetElement, icons);

    }

    service.clickSelectWord = function(target) {
        if (service.ignoreWordClick) return

        targetElement = target;
        icons = [createAppellationIcon];

        service.deSelectAll();  // New selection.

        service.select(target);
        service.displayActions(targetElement, icons);
    }

    /**
     * Display a set of icons next to DOM element.
     */
    service.displayActions = function(element, icons) {

        /**
         * Get the appropriate offset for icons, based on the position of element.
         */
        var calculatePosition = function() {
            var position = element.position();
            position.left += element.width();
            position.top -= 5;
            return position;
        }

        service.clearActions();

        var parent = $('<div>', {class: 'actionIcons panel'});
        icons.forEach(function(icon) {
            var elem = $("<button>", {class: "btn btn-primary btn-xs"});
            var iData = {class: "glyphicon " + icon.type, id:icon.id};
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

app.factory('appellationService', ['$rootScope', 'Appellation', function($rootScope, Appellation) {
    var service = {};

    service.getAppellations = function(callback) {
        Appellation.query(function(appellations) {
            service.appellations = appellations;
            callback(appellations);
        });

    }

    service.getAppellation = function(appId) {  // Retrieve by ID.
        var found;
        service.appellations.forEach(function(appellation) {
            if (String(appellation.id) == String(appId)) found = appellation;
        });
        return found;    // null if not found.
    }

    service.getAppellationIndex = function(appId) {  // Retrieve by ID.
        var foundIndex;
        service.appellations.forEach(function(appellation, index) {
            if (String(appellation.id) == String(appId)) foundIndex = index;
        });
        return foundIndex;
    }

    service.createAppellation = function(data) {
        var appellation = new Appellation(data);
        appellation.$save(function(a, rHeaders) {
            service.appellations.push(a);
            $rootScope.$broadcast('newAppellation', a);
        });
    }

    service.deleteAppellation = function(data) {
        var app = service.getAppellation(data.id);
        var appData = {
            id: app.id,
            tokenIds: app.tokenIds,
            stringRep: app.stringRep
        }
        Appellation.delete(data, function() {
            service.getAppellations(function() { null; });  // Refresh.
            $rootScope.$broadcast('deleteAppellation', appData);
        });
    }

    return service;
}]);


app.controller('InstructionController', function($scope, $sce) {
    $scope.message = 'current !! message';

    $scope.setMessage = function(message) {
        $scope.message = message;
        $scope.$apply();
    }

    $scope.$on('newMessage', function(event, msg) {
        $scope.setMessage($sce.trustAsHtml(msg));
    });
});

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

app.controller('ModalConceptControl', function ($scope, $modal, $log, appellationService) {
    $scope.animationsEnabled = true;
    $scope.open = function (text) {
        var modalInstance = $modal.open({
            animation: $scope.animationsEnabled,
            templateUrl: 'modalConcept.html',
            controller: 'ModalInstanceController',
            resolve: {
                text: function() {
                    return text;
                },
            }
        });

        modalInstance.result.then(function (modalData) {
            var annotationScope = angular.element(document.getElementById('annotations')).scope();

            // TODO: handle case that modal is closed without selection.
            var concept = modalData.concept.originalObject;

            var data = {    // Appellation creation payload.
                interpretation: concept.id,
                stringRep: modalData.text.stringRep,
                tokenIds: modalData.text.tokenIds,
                occursIn: 1,
                createdBy: 1,
                inSession: 1
            }
            appellationService.createAppellation(data);

        }, function () {
            $log.info('Modal dismissed at: ' + new Date());
        });
    };

    $scope.toggleAnimation = function () {
        $scope.animationsEnabled = !$scope.animationsEnabled;
    };
});

app.controller('ModalInstanceController', function ($scope, $modalInstance, text) {
    $scope.text = text;
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

        $rootScope.$on('deleteAppellation', function(event, a) {
            unHighlight(a);
            selectionService.deSelectAll();
            selectionService.clearActions();
        });
    }
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






