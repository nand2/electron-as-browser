const { protocol } = require('electron');
const { createPublicClient, http, decodeAbiParameters } = require('viem');
const { normalize: ensNormalize } = require('viem/ens')
const mime = require('mime-types')
// We need that only for the short-name -> id mapping, for the resolution of EIP-3770 address
// const {chains: ethChainsPkgWeb3Chains } = require('eth-chains')
// Temporary until the above package has auto-update activated (looks like it is coming very soon)
const chainsJsonFileChains = require('./web3-chains.js')
const { PassThrough } = require('stream')

//
// EIP-4808 web3:// protocol
//

const registerWeb3Protocol = (web3Chains) => {

  //
  // Domain name handling
  // Assumption : all domain names are resolving on ethereum mainnet
  //

  // Is it a supported domain name? (ENS, ...)
  const isSupportedDomainName = (domainName, web3chain) => {
    return typeof domainName == 'string' && 
      // ENS is supported on mainnet, goerli and sepolia
      domainName.endsWith('.eth') && [1, 5, 11155111].includes(web3chain.id);
  }

  // Attempt resolution of the domain name
  // Must return an exception if failure
  const resolveDomainName = async (domainName, web3Client) => {
    // ENS
    if(domainName.endsWith('.eth')) {
      let address = await web3Client.getEnsAddress({ name: ensNormalize(domainName) });
      if(address == "0x0000000000000000000000000000000000000000") {
        throw new Error("Unable to resolve the argument as an ethereum .eth address")
      }
      return address;
    }

    throw new Error('Unrecognized domain name : ' + domainName)
  }

  // Follow eip-6821 standard : if there is a contentcontract TXT record 
  // with a common or EIP-3770 address, then go there. Otherwise, go to the resolved address.
  const resolveDomainNameForEIP4804 = async (domainName, web3Client) => {
    let result = {
      address: null,
      chainId: null,
    };

    // ENS
    if(domainName.endsWith('.eth')) {
      // Get the contentcontract TXT record
      const contentContractTxt = await web3Client.getEnsText({
        name: ensNormalize(domainName),
        key: 'contentcontract',
      })

      // contentcontract TXT case
      if(contentContractTxt) {
        let contentContractTxtParts = contentContractTxt.split(':');
        // Simple address?
        if(contentContractTxtParts.length == 1) {
          if(/^0x[0-9a-fA-F]{40}/.test(contentContractTxt) == false) {
            throw new Error("Invalid address in contentcontract TXT record")
          }
          result.address = contentContractTxt;
        }
        // EIP-3770 address
        else if(contentContractTxtParts.length == 2) {
          // Search the chain by its chain short name
          let chainByShortName = Object.values(chainsJsonFileChains).find(chain => chain.shortName == contentContractTxtParts[0]) || null
          if(chainByShortName == null) {
            throw new Error("The chain short name of the contentcontract TXT record was not found")
          }
          if(/^0x[0-9a-fA-F]{40}/.test(contentContractTxtParts[1]) == false) {
            throw new Error("Invalid address in contentcontract TXT record")
          }
          result.chainId = chainByShortName.chainId
          result.address = contentContractTxtParts[1]
        }
        // Mistake
        else {
          throw new Error("Invalid address in contentcontract TXT record")
        }
      }
      // No contentcontract TXT
      else {
        result.address = await resolveDomainName(domainName, web3Client);
      }
    }
    // All other domains
    else {
      result.address = await resolveDomainName(domainName, web3Client);
    }

    return result;
  }


  //
  // The supported types in arguments
  //

  let supportedTypes = [
    {
      type: 'uint256',
      autoDetectable: true,
      parse: async (x, web3Client) => {
        // Prevent parsing of hexadecimal numbers
        if(x.length >= 2 && x.substr(0, 2) == '0x') {
          throw new Error("Number must not be in hexadecimal format")
        }

        x = parseInt(x)
        if(isNaN(x)) {
          throw new Error("Number is not parseable")
        }
        if(x < 0) {
          throw new Error("Number must be positive")
        }
        return x
      },
    },
    {
      type: 'bytes32',
      autoDetectable: true,
      parse: async (x, web3Client) => {
        if(x.length != 34) {
          throw new Error("Bad length (must include 0x in front)")
        }
        if(x.substr(0, 2) != '0x') {
          throw new Error("Must start with 0x")
        }
        return x
      }
    }, 
    {
      type: 'address',
      autoDetectable: true,
      parse: async (x, web3Client) => {
        if(x.length == 22 && x.substr(0, 2) == '0x') {
          return x;
        }
        if(isSupportedDomainName(x, web3Client.chain)) {
          // Will throw an error if failure
          let xAddress = await resolveDomainName(x, web3Client);
          return xAddress;
        }

        throw new Error("Unrecognized address")
      }
    },
    {
      type: 'bytes',
      autoDetectable: true,
      parse: async (x, web3Client) => {
        if(x.length < 2 || x.substr(0, 2) != '0x') {
          throw new Error("Must start with 0x");
        }

        return x;
      },
    },
    {
      type: 'string',
      autoDetectable: false,
      parse: async (x, web3Client) => x,
    },
  ];



  //
  // web3:// call handling
  //

  let result = protocol.registerStreamProtocol("web3", async (request, callback) => {
    let outputHttpHeaders = {}
    let outputHttpCode = 200;

    let url = null
    try {
      url = new URL(request.url);
    }
    catch {
      let output = 'Unable to parse URL';
      displayError(output, callback, outputHttpHeaders)
      return;
    }

    // Web3 network : if provided in the URL, use it, or mainnet by default
    let web3chain = web3Chains["mainnet"];
    // Was the network id specified?
    if(isNaN(parseInt(url.port)) == false) {
      let web3ChainId = parseInt(url.port);
      // Find the matching chain
      web3chain = Object.values(web3Chains).find(chain => chain.id == web3ChainId)
      if(web3chain == null) {
        let output = 'No chain found for id ' + web3ChainId;
        displayError(output, callback, outputHttpHeaders)
        return;        
      }
    }
    

    // Prepare the web3 client
    let web3Client = createPublicClient({
      chain: web3chain,
      transport: http(),
    });

    // Contract address / Domain name
    let contractAddress = url.hostname;
    // If not looking like an address...
    if(/^0x[0-9a-fA-F]{40}/.test(contractAddress) == false) {
      if(isSupportedDomainName(contractAddress, web3chain)) {
        // Debugging : Store the chain id of the resolver
        outputHttpHeaders['web3-nameservice-chainid'] = "" + web3Client.chain.id;

        let resolutionInfos = null
        try {
          resolutionInfos = await resolveDomainNameForEIP4804(contractAddress, web3Client)
        }
        catch(err) {
          let output = 'Failed to resolve domain name ' + contractAddress;
          displayError(output, callback, outputHttpHeaders)
          return;
        }

        // Set contract address
        contractAddress = resolutionInfos.address
        // We got an address on another chain? Update the web3Client
        if(resolutionInfos.chainId) {
          web3chain = Object.values(web3Chains).find(chain => chain.id == resolutionInfos.chainId)
          web3Client = createPublicClient({
            chain: web3chain,
            transport: http(),
          });
        }
      }
      // Domain name not supported in this chain
      else {
        let output = 'Unresolvable domain name : ' + contractAddress + ' : no supported resolvers found in this chain';
        displayError(output, callback, outputHttpHeaders)
        return;
      }
    }
    // Store this for debugging
    outputHttpHeaders['web3-target-chainid'] = "" + web3Client.chain.id;
    outputHttpHeaders['web3-contract-address'] = contractAddress;

    // Contract method && args && result
    // 3 modes :
    // - Auto : we parse the path and arguments and send them
    // - Manual : we forward all the path & arguments as calldata
    // - eip5219 : Implement IDecentralizedApp
    let contractMode = 'auto'
    let contractReturnDataTypes = [{type: 'string'}];
    let contractReturnMimeType = 'text/html';
    let contractReturnJsonEncode = false;
    let output = '';

    // If we have a web3 url without the initial "/", add it
    // That is the behavior of browsers
    if (url.pathname == "") {
      url.pathname = "/"
    }

    let pathnameParts = url.pathname.split('/')

    // If the last pathname part contains a dot, assume an extension
    // Try to extract the mime type
    if(pathnameParts.length >= 2) {
      let argValueParts = pathnameParts[pathnameParts.length - 1].split('.')
      if(argValueParts.length > 1) {
        let mimeType = mime.lookup(argValueParts[argValueParts.length - 1])
        if(mimeType != false) {
          contractReturnMimeType = mimeType
          pathnameParts[pathnameParts.length - 1] = argValueParts.slice(0, -1).join('.')
        }
      }
    }

    // Detect the contract mode
    {
      // Detect if the contract is in eip5219 mode : request() must exist
      // This is a temporary quick and dirty implementation ; I think that it will eventually be 
      // included in the EIP-4804 resolveMode()
      try {
        await web3Client.readContract({
          address: contractAddress,
          abi: [{
            inputs: [
              {
                type: 'string[]'
              },
              {
                "components": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "string"
                  }
                ],
                "type": "tuple[]"
              }
            ],
            name: 'request',
            outputs: [
              {
                "type": "uint256"
              },
              {
                "type": "string"
              },
              {
                "components": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "string"
                  }
                ],
                "type": "tuple[]"
              }
            ],
            stateMutability: 'view',
            type: 'function',
          }],
          functionName: 'request',
          args: [[], []],
        });

        // If the call succeded, we are in eip5219 mode (temporary)
        contractMode = 'eip5219';
      }
      catch(err) {/** If call to resolveMode fails, we default to auto */}

      // Detect if the contract is manual mode : resolveMode must returns "manual"
      if(contractMode == 'auto') {
        let resolveMode = '';
        try {
          resolveMode = await web3Client.readContract({
            address: contractAddress,
            abi: [{
              inputs: [],
              name: 'resolveMode',
              outputs: [{type: 'bytes32'}],
              stateMutability: 'view',
              type: 'function',
            }],
            functionName: 'resolveMode',
            args: [],
          })
        }
        catch(err) {/** If call to resolveMode fails, we default to auto */}

        let resolveModeAsString = Buffer.from(resolveMode.substr(2), "hex").toString().replace(/\0/g, '');
        if(['', 'auto', 'manual'].indexOf(resolveModeAsString) === -1) {
          displayError("web3 resolveMode '" + resolveModeAsString + "' is not supported", callback, outputHttpHeaders)
          return;
        }
        if(resolveModeAsString == "manual") {
          contractMode = 'manual';
        }
      }

      // Store the manual mode as debugging
      outputHttpHeaders['web3-resolve-mode'] = contractMode;
    }

    // Process a manual mode call or an frontpage auto-mode
    if(contractMode == 'manual' || contractMode == "auto" && pathnameParts.length == 2 && pathnameParts[1] == "") {
      let callData = url.pathname + (Array.from(url.searchParams.values()).length > 0 ? "?" + url.searchParams : "");
      try {
        let serializedCallData = "0x" + Buffer.from(callData).toString('hex')
        // If auto mode and calling the frontpage : the callData must be empty
        if(contractMode == "auto") {
          serializedCallData = "0x"
        }

        // Debugging : store the calldata
        outputHttpHeaders['web3-calldata'] = serializedCallData

        let rawOutput = await web3Client.call({
          to: contractAddress,
          data: serializedCallData
        })

        // Looks like this is what happens when calling non-contracts
        if(rawOutput.data === undefined) {
          throw new Error("Looks like the address is not a contract.");
        }

        rawOutput = decodeAbiParameters([
            { type: 'bytes' },
          ],
          rawOutput.data,
        )

        output = Buffer.from(rawOutput[0].substr(2), "hex")
      }
      catch(err) {
        displayError(err.toString(), callback, outputHttpHeaders)
        return;
      }
    }
    // Process a auto mode call
    else if(contractMode == 'auto') {
      let contractMethodName = '';
      let contractMethodArgsDef = [];
      let contractMethodArgs = [];

      contractMethodName = pathnameParts[1];

      pathnameParts = pathnameParts.slice(2)
      for(let i = 0; i < pathnameParts.length; i++) {
        let argValue = pathnameParts[i]
        let detectedType = null;

        // First we look for an explicit cast
        for(j = 0; j < supportedTypes.length; j++) {
          if(argValue.startsWith(supportedTypes[j].type + '!')) {
            argValue = argValue.split('!').slice(1).join('!')
            try {
              argValue = await supportedTypes[j].parse(argValue, web3Client)
            }
            catch(e) {
              output = 'Argument ' + i + ' was explicitely requested to be casted to ' + supportedTypes[j].type + ', but : ' + e;
              displayError(output, callback, outputHttpHeaders)
              return;
            }
            detectedType = supportedTypes[j].type
            break;
          }
        }

        // Next, if no explicit cast, try to detect
        if(detectedType == null) {
          for(j = 0; j < supportedTypes.length; j++) {
            if(supportedTypes[j].autoDetectable) {
              try {
                argValue = await supportedTypes[j].parse(argValue, web3Client)
                detectedType = supportedTypes[j].type

                break
              }
              catch(e) {
              }
            }
          }
        }

        // Finally, save the args and its type
        contractMethodArgsDef.push({type: detectedType ? detectedType : "bytes"})
        contractMethodArgs.push(argValue)
      }

      // Handle the return definition
      let returnsParam = url.searchParams.get('returns')
      if(returnsParam && returnsParam.length >= 2) {
        // When we have a return definition, we returns everything as JSON
        contractReturnJsonEncode = true;

        returnsParamParts = returnsParam.substr(1, returnsParam.length - 2).split(',').map(returnType => returnType.trim()).filter(x => x != '')

        if(returnsParamParts == 0) {
          contractReturnDataTypes = [{type: 'bytes'}]
        }
        else {
          contractReturnDataTypes = []
          for(let i = 0; i < returnsParamParts.length; i++) {
            contractReturnDataTypes.push({type: returnsParamParts[i]})
          }
        }
      }

      // Debugging : store the method, args, return data
      outputHttpHeaders['web3-auto-method'] = contractMethodName
      outputHttpHeaders['web3-auto-method-arg-types'] = JSON.stringify(contractMethodArgsDef)
      outputHttpHeaders['web3-auto-method-arg-values'] = JSON.stringify(contractMethodArgs)
      outputHttpHeaders['web3-auto-method-return'] = JSON.stringify(contractReturnDataTypes)


      // Contract definition
      let abi = [
        {
          inputs: contractMethodArgsDef,
          name: contractMethodName,
          // Assuming string output
          outputs: contractReturnDataTypes,
          stateMutability: 'view',
          type: 'function',
        },
      ];
      let contract = {
        address: contractAddress,
        abi: abi,
      };

      // Make the call!
      try {
        output = await web3Client.readContract({
          ...contract,
          functionName: contractMethodName,
          args: contractMethodArgs,
        })
      }
      catch(err) {
        displayError(err.toString(), callback, outputHttpHeaders)
        return;
      }
    }
    else if(contractMode == 'eip5219') {
      // Get full pathname parts (url.pathname is always at least "/")
      let pathnameParts = url.pathname.split('/').slice(1)
      // Frontpage ("/") : we send empty array
      if(pathnameParts.length == 1 && pathnameParts[0] == "") {
        pathnameParts = [];
      }
      // Get query values
      let queryValues = Object.entries(Object.fromEntries(url.searchParams.entries()));

      try {
        let eip5219CallResult = await web3Client.readContract({
          address: contractAddress,
          abi: [{
            inputs: [
              {
                type: 'string[]'
              },
              {
                "components": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "string"
                  }
                ],
                "type": "tuple[]"
              }
            ],
            name: 'request',
            outputs: [
              {
                "type": "uint256"
              },
              {
                "type": "string"
              },
              {
                "components": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "string"
                  }
                ],
                "type": "tuple[]"
              }
            ],
            stateMutability: 'view',
            type: 'function',
          }],
          functionName: 'request',
          args: [
            pathnameParts, 
            queryValues
          ],
        });

        outputHttpCode = eip5219CallResult[0]
        output = eip5219CallResult[1]
        eip5219CallResult[2]
        eip5219CallResult[2].forEach(header => {
          outputHttpHeaders[header[0]] = header[1]
        })
      }
      catch(err) {
        displayError(err.toString(), callback, outputHttpHeaders)
        return;
      }
    }


    // Cast as json if requested
    if(contractReturnJsonEncode) {
      contractReturnMimeType = 'application/json'
      if((output instanceof Array) == false) {
        output = [output]
      }
      output = JSON.stringify(output.map(x => "" + x))
    }

    // If contractReturnMimeType was determined (auto and manual mode), then
    // set it as Content-type
    if(contractMode == "auto" || contractMode == "manual") {
      outputHttpHeaders['Content-type'] = contractReturnMimeType;
    }

    // ReadableStream
    const stream = new PassThrough()
    stream.push(output)
    stream.push(null)

    callback({ 
      statusCode: outputHttpCode, 
      data: stream,
      headers: outputHttpHeaders })
  })


  //
  // Utilities
  //

  // Display an error on the browser. callbackFunction is the callback from registerStreamProtocol
  const displayError = (errorText, callbackFunction, outputHttpHeaders) => {
    output = '<html><head><meta charset="utf-8" /></head><body><pre>' + errorText + '</pre></body></html>';

    const stream = new PassThrough()
    stream.push(output)
    stream.push(null)

    callbackFunction({ 
      statusCode: 500, 
      mimeType: 'text/html', 
      data: stream,
      headers: outputHttpHeaders })
  }

  console.log('Web3 protocol registered: ', result)
}

module.exports = { registerWeb3Protocol }