import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as fs from "fs";

const vpc = new aws.ec2.Vpc("vpc", {
    cidrBlock: "10.0.0.0/16",
});
const subnet1a = new aws.ec2.Subnet("subnet1a", {
    vpcId: vpc.id,
    cidrBlock: "10.0.1.0/24",
    availabilityZone: "ap-southeast-1a",
    tags: {
        Name: "Main",
    },
});
const subnet1b = new aws.ec2.Subnet("subnet1b", {
    vpcId: vpc.id,
    cidrBlock: "10.0.2.0/24",
    availabilityZone: "ap-southeast-1b",
    tags: {
        Name: "Main",
    },
});
const gw = new aws.ec2.InternetGateway("gw", {
    vpcId: vpc.id,
    tags: {
        Name: "main",
    },
});
const routeTable = new aws.ec2.RouteTable("routeTable", {
    vpcId: vpc.id,
    routes: [
        {
            cidrBlock: "0.0.0.0/0",
            gatewayId: gw.id,
        },
    ],
    tags: {
        Name: "example",
    },
});
const routeTableAssociation = new aws.ec2.RouteTableAssociation("routeTableAssociation", {
    subnetId: subnet1a.id,
    routeTableId: routeTable.id,
});
const barDirectory = new aws.directoryservice.Directory("barDirectory", {
    name: "corp.notexample.com",
    password: "SuperSecretPassw0rd",
    edition: "Standard",
    type: "MicrosoftAD",
    vpcSettings: {
        vpcId: vpc.id,
        subnetIds: [
            subnet1a.id,
            subnet1b.id,
        ],
    },
    tags: {
        Project: "foo",
    },
});
const os = aws.ec2.getAmi({
    mostRecent: true,
    filters: [
        {
            name: "name",
            values: ["Windows_Server-2019-English-Full-Base-*"],
        },
        {
            name: "virtualization-type",
            values: ["hvm"],
        },
    ],
    owners: ["801119661308"],
});
const allowRDP = new aws.ec2.SecurityGroup("allowRDP", {
    description: "Allow RDP inbound traffic",
    vpcId: vpc.id,
    ingress: [{
        description: "RDP from VPC",
        fromPort: 3389,
        toPort: 3389,
        protocol: "tcp",
        cidrBlocks: ["0.0.0.0/0"],
    }],
    egress: [{
        fromPort: 0,
        toPort: 0,
        protocol: "-1",
        cidrBlocks: ["0.0.0.0/0"],
    }],
    tags: {
        Name: "allow_rdp",
    },
});
const deployer = new aws.ec2.KeyPair("deployer", {
    publicKey: fs.readFileSync('./script/windows-keypair.pub', 'utf8'),
});
const foo = new aws.ssm.Document("foo", {
    content: pulumi.interpolate`  {
    "schemaVersion": "1.2",
    "description": "Check ip configuration of a Linux instance.",
    "parameters": {

    },
    "runtimeConfig": {
      "aws:domainJoin": {
        "properties": [
          {
            "directoryId": "${barDirectory.id}",
            "directoryName": "${barDirectory.name}",
            "directoryOU": "",
            "dnsIpAddresses": ["${barDirectory.dnsIpAddresses[0]}", "${barDirectory.dnsIpAddresses[1]}"]
          }
        ]
      }
    }
  }
`,
    documentType: "Command",
});
const role = new aws.iam.Role("testRole", {
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Sid: "",
            Principal: {
                Service: "ec2.amazonaws.com",
            },
        }],
    }),
    tags: {
        "tag-key": "tag-value",
    },
});
const policyAttach1 = new aws.iam.PolicyAttachment("policyAttach1", {
    roles: [role.name],
    policyArn: "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
});
const policyAttach2 = new aws.iam.PolicyAttachment("policyAttach2", {
    roles: [role.name],
    policyArn: "arn:aws:iam::aws:policy/AmazonSSMDirectoryServiceAccess",
});
const instanceProfile = new aws.iam.InstanceProfile("instanceProfile", { role: role.name });
const server = new aws.ec2.Instance("server", {
    ami: os.then(os => os.id),
    instanceType: "t2.large",
    iamInstanceProfile: instanceProfile.id,
    vpcSecurityGroupIds: [allowRDP.id],
    subnetId: subnet1a.id,
    associatePublicIpAddress: true,
    keyName: deployer.id,
    tags: {
        Name: "HelloWorld",
    },
});
const ssmAssociation = new aws.ssm.Association("ssmAssociation", {
    instanceId: server.id,
    name: foo.id,
});