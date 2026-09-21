'use strict';
'require view';

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,
	render: function() {
		window.location.replace(L.url('admin/services/k2p-v11'));
		return E('p', _('正在打开简易代理…'));
	}
});
