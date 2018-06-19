'use strict';

export module PolymerTsRegEx {
	export let polymerTSRegEx = {
		component: /(component\s*\((?:['"]{1}(.*)['"]{1})\))/g,
		extend: null,
		property: /(property\s*\(({[a-zA-Z0-9:,\s]*})\)\s*([\w\W]*);)/g,
		observe: /(observe\(([a-zA-Z0-9:,\s'".]*)?\))/,
		computed: /(computed\(({[a-zA-Z0-9:,\s]*})?\))/g,
		listen: /(listen\(([\w.\-'"]*)\))/,
		behavior: /(behavior\s*\((...*)\))/g,
		hostAttributes: null
	};
}

