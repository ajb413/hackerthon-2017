export default (request, response) => {
    response.status = 200;
    response.headers['Content-Type'] = 'text/html; charset=utf-8';

    const content = `____put_file_text_content_here____`;

    return response.send(content);
};