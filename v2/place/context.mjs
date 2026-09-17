// Keep complete JSON and prioritize the newest eligible conversation.
export function echoContext(messages, state, max = 24000) {
  const result = {messages: [], space: [], activity: null};
  const fits = () => JSON.stringify(result).length <= max;
  for (const message of [...messages].reverse()) {
    result.messages.unshift(message);
    if (!fits()) {
      result.messages.shift();
      // An unusually large/escaped latest message must not empty all context.
      if (!result.messages.length) {
        const shortened={...message,text:''};result.messages.push(shortened);
        let low=0,high=message.text.length;
        while(low<high){const mid=Math.ceil((low+high)/2);shortened.text=message.text.slice(-mid);if(fits())low=mid;else high=mid-1;}
        shortened.text=low?message.text.slice(-low):'';
        if(!fits())result.messages=[];
      }
      break;
    }
  }
  const activity = state.activity;
  if (activity) {
    result.activity = {owner: activity.owner, target: activity.target, status: activity.status, index: activity.index, answers: []};
    if (!fits()) result.activity = null;
    else for (const answer of [...activity.answers].reverse()) {
      result.activity.answers.unshift(answer);
      if (!fits()) { result.activity.answers.shift(); break; }
    }
  }
  for (const {type,title,done,approvals,steps} of state.items.filter(i => i.aiAllowed).slice(0,30)) {
    result.space.push({type,title,done,approvals,steps});
    if (!fits()) { result.space.pop(); break; }
  }
  return JSON.stringify(result);
}
