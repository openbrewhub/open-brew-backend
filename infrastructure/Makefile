build-infra:
	cd infrastructure; 	\ 
	yarn build

prepare-deploy: build-ui
	cd infrastructure;	\
	yarn;

deploy: prepare-deploy
	cd infrastructure;	\
	yarn cdk deploy

deploy-ci: prepare-deploy
	cd infrastructure;	\
	yarn cdk deploy --require-approval never