---
title: Something about FTP and relatives
date: 2026-09-28
tags: [ftp,server,network]
---

# File transfer protocol
This is a TCP based file transferring protocol. Implements a client server model. where clients can listen to a server and recieve a file. Most commonly it uses a plain text based sign in and encrypts the file stream with the credentials or with SSL certificates. Currently replaced by SFTP (SSH File Transfer Protocol).

## Data transfer in FTP
- In ***active*** mode the client listens on a specific port (20). The client will sent the server which port it is defined. After getting the port, server will initiate the transmission.
- In ***passive*** mode is used when a firewall is active for the client. where the client cannot recieve TCP packets. The client will send a PASV command and server will reply it with it's IP and port. Then client will start the transaction from an arbitary port.

## Error codes
FTP uses 3 digit error code scheme to represent different results of action.

- ```200``` – Command executed successfully.
- ```221``` – Service closing control connection.
- ```331``` – Username accepted; password required.
- ```502``` – Command not implemented.
- ```503``` – Incorrect sequence of commands.
- ```504``` – Command not supported for that parameter.
- ```530``` – User not logged in (authentication failed).
- ```551``` – Requested action aborted: page type unknown.

[Refer this doc](https://hstechdocs.helpsystems.com/manuals/globalscape/cuteftpmacpro3/Numbered_FTP_status_and_error_codes.htm)

## Type of connections
### Control connection
- This connection is established on port 21
- Used for trasferring authentication info.
- Commands for file operations
- Remains active for the entire session.

### Data connection
- Uses TCP port 20.
- Created seperately for each transfer.
- Only used to send data.
- Closes automatically after transmission.
