param([Parameter(Mandatory=$true)][string]$Account,[string]$Project='book-9b8ce',[string]$Region='asia-northeast3',[string]$Bucket='book-9b8ce.firebasestorage.app')
$ErrorActionPreference='Stop'
function Cloud {param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments) & gcloud @Arguments --project $Project --account $Account --quiet; if($LASTEXITCODE -ne 0){throw "gcloud failed: $($Arguments[0..1] -join ' ')"} }
function Exists {param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments) $previous=$ErrorActionPreference;try{$ErrorActionPreference='Continue';& gcloud @Arguments --project $Project --account $Account --quiet 2>$null | Out-Null;return $LASTEXITCODE -eq 0}finally{$ErrorActionPreference=$previous} }
New-Item -ItemType Directory -Force (Join-Path $PSScriptRoot '../.qa') | Out-Null
$worker="homework-video-worker@$Project.iam.gserviceaccount.com"
$tasks="homework-video-tasks@$Project.iam.gserviceaccount.com"
$builder="homework-video-build@$Project.iam.gserviceaccount.com"
Cloud @('services','enable','run.googleapis.com','cloudtasks.googleapis.com','cloudbuild.googleapis.com','artifactregistry.googleapis.com','iam.googleapis.com','iamcredentials.googleapis.com')
foreach($name in @('homework-video-worker','homework-video-tasks','homework-video-build')){if(!(Exists @('iam','service-accounts','describe',"$name@$Project.iam.gserviceaccount.com"))){Cloud @('iam','service-accounts','create',$name,'--display-name',($name -replace '-',' '))}}
if(!(Exists @('artifacts','repositories','describe','homework-workers','--location',$Region))){Cloud @('artifacts','repositories','create','homework-workers','--repository-format','docker','--location',$Region)}
$sourceBucket="gs://$Project-video-build-source"
if(!(Exists @('storage','buckets','describe',$sourceBucket))){Cloud @('storage','buckets','create',$sourceBucket,'--location',$Region,'--uniform-bucket-level-access')}
Cloud @('projects','add-iam-policy-binding',$Project,'--member',"serviceAccount:$worker",'--role','roles/datastore.user','--condition=None')
Cloud @('projects','add-iam-policy-binding',$Project,'--member',"serviceAccount:$builder",'--role','roles/logging.logWriter','--condition=None')
Cloud @('storage','buckets','add-iam-policy-binding',$sourceBucket,'--member',"serviceAccount:$builder",'--role','roles/storage.objectViewer','--condition=None')
Cloud @('artifacts','repositories','add-iam-policy-binding','homework-workers','--location',$Region,'--member',"serviceAccount:$builder",'--role','roles/artifactregistry.writer','--condition=None')
$conditionPath=Join-Path $PSScriptRoot '../.qa/video-storage-condition.json'
@{title='video-homework-objects';description='Read original homework videos and manage processed video objects only';expression="resource.name.startsWith('projects/_/buckets/$Bucket/objects/uploads/') || resource.name.startsWith('projects/_/buckets/$Bucket/objects/processed-videos/')"}|ConvertTo-Json|Set-Content -LiteralPath $conditionPath -Encoding utf8
Cloud @('storage','buckets','add-iam-policy-binding',"gs://$Bucket",'--member',"serviceAccount:$worker",'--role','roles/storage.objectUser','--condition-from-file',$conditionPath)
if(!(Exists @('tasks','queues','describe','homework-video','--location',$Region))){Cloud @('tasks','queues','create','homework-video','--location',$Region,'--max-concurrent-dispatches','3','--max-dispatches-per-second','1','--max-attempts','5','--min-backoff','15s','--max-backoff','300s','--max-retry-duration','7200s')}
Cloud @('tasks','queues','add-iam-policy-binding','homework-video','--location',$Region,'--member',"serviceAccount:firebase-adminsdk-fbsvc@$Project.iam.gserviceaccount.com",'--role','roles/cloudtasks.enqueuer')
Cloud @('iam','service-accounts','add-iam-policy-binding',$tasks,'--member',"serviceAccount:firebase-adminsdk-fbsvc@$Project.iam.gserviceaccount.com",'--role','roles/iam.serviceAccountUser')
Write-Output 'Video infrastructure prepared. No public worker access granted.'
