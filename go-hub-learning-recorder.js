function required(value,label){const text=String(value||"").trim();if(!text)throw new Error(`${label} is required`);return text;}
export function recordLesson(input={}){
  return Object.freeze({id:required(input.id,"id"),context:required(input.context,"context"),action:required(input.action,"action"),finding:required(input.finding,"finding"),resolution:required(input.resolution,"resolution"),reusableWhen:required(input.reusableWhen,"reusableWhen"),sourceTaskId:required(input.sourceTaskId,"sourceTaskId"),sourceArtifactDigest:required(input.sourceArtifactDigest,"sourceArtifactDigest"),recordedAt:required(input.recordedAt,"recordedAt"),status:"RECORDED"});
}
