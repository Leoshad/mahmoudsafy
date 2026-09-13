const PlaceScroll={
 capture(root){const edge=root.getBoundingClientRect().top;const row=[...root.querySelectorAll('.message')].find(n=>n.getBoundingClientRect().bottom>edge);return {id:row?.dataset.message,offset:row?row.getBoundingClientRect().top-edge:0,top:root.scrollTop,end:root.scrollHeight-root.scrollTop-root.clientHeight<60};},
 restore(root,mark){if(mark.end){root.scrollTop=root.scrollHeight;return;}const row=[...root.querySelectorAll('.message')].find(n=>n.dataset.message===mark.id);root.scrollTop=row?root.scrollTop+row.getBoundingClientRect().top-root.getBoundingClientRect().top-mark.offset:mark.top;}
};
