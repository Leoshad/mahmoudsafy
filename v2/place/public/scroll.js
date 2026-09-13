const PlaceScroll={
 capture(root){const edge=root.getBoundingClientRect().top;const row=[...root.querySelectorAll('.message,[data-activity]')].find(n=>n.getBoundingClientRect().bottom>edge);return {id:row?(row.dataset.message||'activity:'+row.dataset.activity):undefined,offset:row?row.getBoundingClientRect().top-edge:0,top:root.scrollTop,end:root.scrollHeight-root.scrollTop-root.clientHeight<60};},
 restore(root,mark){if(mark.end){root.scrollTop=root.scrollHeight;return;}const row=[...root.querySelectorAll('.message,[data-activity]')].find(n=>(n.dataset.message||'activity:'+n.dataset.activity)===mark.id);root.scrollTop=row?root.scrollTop+row.getBoundingClientRect().top-root.getBoundingClientRect().top-mark.offset:mark.top;}
};
