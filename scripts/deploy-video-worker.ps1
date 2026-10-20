param([Parameter(Mandatory=$true)][string]$Account,[Parameter(Mandatory=$true)][string]$Tag,[string]$Project='book-9b8ce',[string]$Region='asia-northeast3',[string]$Bucket='book-9b8ce.firebasestorage.app')
$ErrorActionPreference='Stop'
$image="$Region-docker.pkg.dev/$Project/homework-workers/video:$Tag"
& gcloud.cmd builds submit workers/video --config workers/video/cloudbuild.yaml --substitutions "_IMAGE=$image" --service-account "projects/$Project/serviceAccounts/homework-video-build@$Project.iam.gserviceaccount.com" --gcs-source-staging-dir "gs://$Project-video-build-source/source" --region $Region --project $Project --account $Account --quiet
if($LASTEXITCODE -ne 0){throw 'Video worker container build failed'}
& gcloud.cmd run deploy homework-video-worker --image $image --service-account "homework-video-worker@$Project.iam.gserviceaccount.com" --region $Region --project $Project --account $Account --cpu 2 --memory 2Gi --concurrency 1 --timeout 1200 --min-instances 0 --max-instances 3 --no-allow-unauthenticated --set-env-vars "VIDEO_STORAGE_BUCKET=$Bucket,GOOGLE_CLOUD_PROJECT=$Project" --quiet
if($LASTEXITCODE -ne 0){throw 'Video worker deployment failed'}
& gcloud.cmd run services add-iam-policy-binding homework-video-worker --region $Region --project $Project --account $Account --member "serviceAccount:homework-video-tasks@$Project.iam.gserviceaccount.com" --role roles/run.invoker --quiet
if($LASTEXITCODE -ne 0){throw 'Video task invocation permission failed'}
& gcloud.cmd run services describe homework-video-worker --region $Region --project $Project --account $Account --format 'value(status.url)'
