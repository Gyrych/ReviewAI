#include <stdint.h>
#include "cmsis_os2.h"
#include <map>
#include "Thead.h"

CThead::CThead(osThreadFunc_t function, void * argument, const osThreadAttr_t * attr)
{
	id = osThreadNew(function, argument, attr);
	func = function;
	mTheadTree[id] = this;
}

CThead::~CThead()
{
	if(osOK != osThreadTerminate(id))
	{
		;//关闭线程失败
	}
}