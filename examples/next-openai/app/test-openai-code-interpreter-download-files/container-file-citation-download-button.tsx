"use client";

import { FileUIPart } from "ai";

export function ContainerFileCitationDownloadButton ({
  part,
}:{
  part:FileUIPart;
}) {
  const {
    mediaType,
    url,
  }=part;
  if(mediaType!=="container_file_citation")return null;

  const file=JSON.parse(url.replace("data:container_file_citation;base64,",""));

  if( !('container_id' in file) || !('file_id' in file) || !('filename' in file) )return null;

  const onClick= ()=>{
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

    window.open(
      `${baseUrl}/api/chat-openai-code-interpreter-download-files/${file.container_id}/${file.file_id}`,
      '_blank'
    )
  }


  return(
    <>
      <button
        className="bg-blue-500 text-white border rounded py-1 px-2"
        onClick={()=>onClick()}
      >
        download <span className="font-bold">{file.filename}</span>
      </button>
    </>
  );
}