var disposeDetectStrategy = require('../component/dispose.compact')
var patch = require('../strategy/patch')
var update = require('./_update')

//插入点机制,组件的模板中有一些slot元素,用于等待被外面的元素替代
var dir = avalon.directive('widget', {
    priority: 4,
    parse: function (cur, pre, binding) {

        var wid = pre.props.wid || avalon.makeHashCode('w')

        cur.wid = avalon.quote(wid)
        cur.template = pre.template
        cur.children = '[]'
        cur[binding.name] = avalon.parseExpr(binding)
        var old = pre.$append || ''
        pre.$append = [
            'var curIndex = vnodes.length - 1',
            'var el = vnodes[curIndex]',
            'if(el.nodeType === 1){',
            'el.local = __local__',
            'el.vmodel = __vmodel__',
            //  'el.wid = '+ avalon.quote(wid),
            'avalon.component(el, vnodes, curIndex,' + cur.wid + ')',
            '}'
        ].join('\n ') + old
    },
    define: function () {
        return avalon.mediatorFactory.apply(this, arguments)
    },
    diff: function (cur, pre, steps) {

        var wid = cur.wid
        if (cur.nodeType === 8) {
            steps.count += 1
            cur.change = [this.replaceByComment]
        } else if (cur.renderCount && cur.renderCount < 2) {
            //https://github.com/RubyLouvre/avalon/issues/1390
            //当第一次渲染组件时,当组件的儿子为元素,而xmp容器里面只有文本时,就会出错
            pre.children = []
            cur.steps = steps
            fixRepeatAction(cur.children)
            update(cur, this.replaceByComponent, steps, 'widget')
            function fireReady(dom, vnode) {
                cur.vmodel.$fire('onReady', {
                    type: 'ready',
                    target: dom,
                    wid: wid,
                    vmodel: vnode.vmodel
                })
                 cur.renderCount = 2
            }
            avalon.log('第一次渲染组件')
            update(cur, fireReady, steps, 'widget', 'afterChange')
        } else {
            var needUpdate = !cur.diff || cur.diff(cur, pre, steps)
            cur.skipContent = !needUpdate
            var viewChangeObservers = cur.vmodel.$events.onViewChange
            if (viewChangeObservers && viewChangeObservers.length) {
                steps.count += 1
                cur.afterChange = [function (dom, vnode) {
                        var preHTML = pre.outerHTML
                        var curHTML = cur.outerHTML ||
                                (cur.outerHTML = avalon.vdomAdaptor(cur, 'toHTML'))
                        if (preHTML !== curHTML) {
                            cur.vmodel.$fire('onViewChange', {
                                type: 'viewchange',
                                target: dom,
                                wid: wid,
                                vmodel: vnode.vmodel
                            })
                        }
                        docker.renderCount++
                    }]
            }

        }
    },
    addDisposeMonitor: function (dom) {
        if (window.chrome && window.MutationEvent) {
            disposeDetectStrategy.byMutationEvent(dom)
        } else if (avalon.modern && typeof window.Node === 'function') {
            disposeDetectStrategy.byRewritePrototype(dom)
        } else {
            disposeDetectStrategy.byPolling(dom)
        }
    },
    replaceByComment: function (dom, node, parent) {
        var comment = document.createComment(node.nodeValue)
        if (dom) {
            parent.replaceChild(comment, dom)
        } else {
            parent.appendChild(comment)
        }
    },
    replaceByComponent: function (dom, node, parent) {
        var com = avalon.vdomAdaptor(node, 'toDOM')
        node.ouerHTML = avalon.vdomAdaptor(node, 'toHTML')
        if (dom) {
            parent.replaceChild(com, dom)
        } else {
            parent.appendChild(com)
        }
        patch([com], [node], parent, node.steps)
     
        var vm = node.vmodel
        var scope = avalon.scopes[vm.wid]
        if (!scope) {
            avalon.scopes[vm.$id] = {
                vmodel: vm,
                render: vm.$render,
                dom: com,
                renderCount: 1,
                local: node.local
            }
            com.vtree = [node]
            //console.log(avalon.scopes[vm.$id].render+"")
        } else {
            scope.local = node.local
            scope.renderCount++
        }

        dir.addDisposeMonitor(com)

        return false
    }
})

function fixRepeatAction(nodes) {
    for (var i = 0, el; el = nodes[i++]; ) {
        if (el.directive === 'for') {
            el.fixAction = true
        }
        if (el.children) {
            fixRepeatAction(el.children)
        }
    }
}
